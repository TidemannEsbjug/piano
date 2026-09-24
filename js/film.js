/* film.js — the explainer film player.
   - custom controls (the scrubber is a node on a string), captions, fullscreen, keyboard
   - chapters read from assets/video/explainer.chapters.vtt; any [data-film-chapter="<cue id>"] link
     on the page seeks the film to that chapter ("Watch this part")
   - end card hands over to the App Store call to action
   - docks to the corner while playing if you scroll on
   - the frame's top string is plucked on play: a standing wave built from the app's own partial
     model, f_n = n·f·√(1 + B·n²), with B exaggerated so the partials visibly drift apart */
(function () {
  'use strict';

  var frame = document.querySelector('[data-film]');
  if (!frame) return;
  var slot = frame.querySelector('.film-frame__slot');
  var screen = frame.querySelector('[data-film-screen]');
  var video = screen.querySelector('video');
  var bigplay = screen.querySelector('[data-film-bigplay]');
  var toggleBtn = screen.querySelector('[data-film-toggle]');
  var muteBtn = screen.querySelector('[data-film-mute]');
  var ccBtn = screen.querySelector('[data-film-cc]');
  var fsBtn = screen.querySelector('[data-film-fs]');
  var scrub = screen.querySelector('[data-film-scrub]');
  var ticks = screen.querySelector('.film-scrub__ticks');
  var timeEl = screen.querySelector('[data-film-time]');
  var replayBtn = screen.querySelector('[data-film-replay]');
  var dockClose = screen.querySelector('.film-dock-close');
  var chapterList = frame.querySelector('[data-film-chapters]');
  var nowEl = frame.querySelector('[data-film-now]');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var chapters = [];            // { id, title, start, end }
  var activeChapter = -1;
  var scrubbing = false;
  var dockDismissed = false;
  var slotRatio = 1;
  var hideTimer = 0;

  /* ---------- helpers ---------- */
  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function duration() { return isFinite(video.duration) ? video.duration : 0; }

  /* ---------- play / pause ---------- */
  function play() {
    dockDismissed = false;
    screen.classList.remove('has-ended');
    screen.classList.add('has-started');
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
  }
  function toggle() { if (video.paused || video.ended) play(); else video.pause(); }

  video.addEventListener('play', function () {
    screen.classList.remove('is-paused'); frame.classList.add('is-playing');
    toggleBtn.setAttribute('aria-label', 'Pause');
    pluck(1); pokeControls(); updateDock(); paintNow();
  });
  video.addEventListener('pause', function () {
    screen.classList.add('is-paused'); frame.classList.remove('is-playing');
    toggleBtn.setAttribute('aria-label', 'Play');
    release(); updateDock();
  });
  video.addEventListener('ended', function () {
    var focusWasInPlayer = screen.contains(document.activeElement);
    var wasDocked = screen.classList.contains('is-docked');
    screen.classList.add('has-ended'); frame.classList.remove('is-playing');
    if (document.fullscreenElement === screen && document.exitFullscreen) document.exitFullscreen();
    release(); updateDock(); paintNow();
    if (replayBtn && focusWasInPlayer && !wasDocked) { try { replayBtn.focus({ preventScroll: true }); } catch (_) {} }
  });

  function failed() {
    if (video.networkState !== 3 && !video.error) return;      // 3 = NETWORK_NO_SOURCE
    clearTimeout(hideTimer); video.pause();
    screen.classList.remove('has-started', 'hide-cursor', 'show-controls');
    screen.classList.add('has-failed');
    var t = bigplay.querySelector('.film-bigplay__title'); if (t) { t.dataset.label = t.dataset.label || t.textContent; t.textContent = 'The film did not load. Try again.'; }
  }
  video.addEventListener('error', failed);
  Array.prototype.forEach.call(video.querySelectorAll('source'), function (src) { src.addEventListener('error', failed); });

  bigplay.addEventListener('click', function () {
    if (screen.classList.contains('has-failed')) {
      screen.classList.remove('has-failed');
      var t = bigplay.querySelector('.film-bigplay__title'); if (t && t.dataset.label) t.textContent = t.dataset.label;
      video.load();
    }
    play();
    try { toggleBtn.focus({ preventScroll: true }); } catch (_) {}   // the big button hides: keep focus (and the shortcuts) in the player
  });
  toggleBtn.addEventListener('click', toggle);
  if (replayBtn) replayBtn.addEventListener('click', function () { video.currentTime = 0; play(); });
  video.addEventListener('click', function () {
    if (screen.classList.contains('is-docked')) { frame.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' }); return; }
    toggle();
  });

  /* ---------- time, scrubber ---------- */
  function paintTime() {
    var d = duration(), t = scrubbing ? Number(scrub.value) : video.currentTime;
    timeEl.textContent = fmt(t) + ' / ' + fmt(d);
    if (!scrubbing) scrub.value = String(t);
    scrub.style.setProperty('--p', (d ? (t / d) * 100 : 0) + '%');
    scrub.setAttribute('aria-valuetext', fmt(t) + ' of ' + fmt(d));
    paintChapter(t);
  }
  video.addEventListener('timeupdate', paintTime);
  video.addEventListener('loadedmetadata', function () {
    scrub.max = String(duration());
    Array.prototype.forEach.call(document.querySelectorAll('[data-film-duration]'), function (n) { n.textContent = fmt(duration()); });
    paintTime(); paintTicks();
  });
  video.addEventListener('durationchange', function () { scrub.max = String(duration()); paintTicks(); });
  scrub.addEventListener('input', function () { scrubbing = true; paintTime(); });
  scrub.addEventListener('change', function () { video.currentTime = Number(scrub.value); scrubbing = false; paintTime(); });
  scrub.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); seekBy(e.key === 'ArrowLeft' ? -5 : 5); }
  });
  function seekBy(dt) { video.currentTime = Math.max(0, Math.min(duration(), video.currentTime + dt)); paintTime(); pokeControls(); }

  /* ---------- mute, captions, fullscreen ---------- */
  function paintMute() {
    screen.classList.toggle('is-muted', video.muted);
    muteBtn.setAttribute('aria-pressed', String(video.muted));
    muteBtn.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
  }
  muteBtn.addEventListener('click', function () { video.muted = !video.muted; });
  video.addEventListener('volumechange', paintMute);
  paintMute();

  function captionTrack() {
    for (var i = 0; i < video.textTracks.length; i++) {
      var k = video.textTracks[i].kind;
      if (k === 'captions' || k === 'subtitles') return video.textTracks[i];
    }
    return null;
  }
  function setCaptions(on) {
    var tr = captionTrack(); if (!tr) return;
    tr.mode = on ? 'showing' : 'hidden';
    ccBtn.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem('resonance.film.cc', on ? '1' : '0'); } catch (_) {}
  }
  if (captionTrack()) {
    var wantCC = false; try { wantCC = localStorage.getItem('resonance.film.cc') === '1'; } catch (_) {}
    setCaptions(wantCC);
    ccBtn.addEventListener('click', function () { setCaptions(ccBtn.getAttribute('aria-pressed') !== 'true'); });
  } else { ccBtn.hidden = true; }
  var ccEl = video.querySelector('track[kind="captions"], track[kind="subtitles"]');
  if (ccEl) {
    var noCC = function () { ccBtn.hidden = true; };
    ccEl.addEventListener('error', noCC);
    if (ccEl.readyState === 3) noCC();                         // HTMLTrackElement.ERROR
  }

  fsBtn.addEventListener('click', function () {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (screen.requestFullscreen) screen.requestFullscreen().catch(function () {});
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();     // iPhone
  });
  if (!screen.requestFullscreen && !video.webkitEnterFullscreen) fsBtn.hidden = true;

  /* ---------- controls visibility ---------- */
  function pokeControls() {
    screen.classList.add('show-controls'); screen.classList.remove('hide-cursor');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (video.paused) return;
      screen.classList.remove('show-controls'); screen.classList.add('hide-cursor');
    }, 2200);
  }
  ['pointermove', 'pointerdown', 'focusin'].forEach(function (t) { screen.addEventListener(t, pokeControls); });
  screen.addEventListener('pointerleave', function () { if (!video.paused) { clearTimeout(hideTimer); screen.classList.remove('show-controls'); } });

  /* ---------- keyboard (when focus is inside the player) ---------- */
  screen.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = e.target.tagName;
    var k = e.key.toLowerCase();
    if ((k === ' ' || k === 'enter') && (tag === 'BUTTON' || tag === 'A')) return;   // let the focused control act
    if (k === ' ' || k === 'k') { e.preventDefault(); if (!screen.classList.contains('has-started')) play(); else toggle(); }
    else if (k === 'arrowleft') { e.preventDefault(); seekBy(-5); }
    else if (k === 'arrowright') { e.preventDefault(); seekBy(5); }
    else if (k === 'm') { video.muted = !video.muted; }
    else if (k === 'f') { fsBtn.click(); }
    else if (k === 'c' && !ccBtn.hidden) { ccBtn.click(); }
    else return;
    pokeControls();
  });

  /* ---------- chapters ---------- */
  function parseTime(s) {
    var p = s.trim().split(':').map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }
  function parseVTT(text) {
    var out = [];
    text.replace(/\r/g, '').split(/\n{2,}/).forEach(function (block) {
      var lines = block.split('\n').filter(Boolean);
      var ti = -1;
      for (var i = 0; i < lines.length; i++) if (lines[i].indexOf('-->') !== -1) { ti = i; break; }
      if (ti === -1) return;
      var times = lines[ti].split('-->');
      var title = lines.slice(ti + 1).join(' ').trim();
      if (!title) return;
      out.push({ id: ti > 0 ? lines[ti - 1].trim() : '', title: title, start: parseTime(times[0]), end: parseTime(times[1].trim().split(/\s+/)[0]) });
    });
    return out;
  }
  function chaptersFromTrack() {
    for (var i = 0; i < video.textTracks.length; i++) {
      var tr = video.textTracks[i];
      if (tr.kind !== 'chapters') continue;
      tr.mode = 'hidden';
      return Array.prototype.map.call(tr.cues || [], function (c) { return { id: c.id, title: c.text, start: c.startTime, end: c.endTime }; });
    }
    return [];
  }
  function loadChapters() {
    var trackEl = video.querySelector('track[kind="chapters"]');
    if (!trackEl) return;
    fetch(trackEl.getAttribute('src'))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(parseVTT)
      .catch(chaptersFromTrack)
      .then(function (list) { chapters = list || []; buildChapters(); });
  }
  function buildChapters() {
    if (!chapters.length) { if (chapterList) chapterList.closest('.film-chapters').hidden = true; return; }
    if (chapterList) {
      chapterList.textContent = '';
      chapters.forEach(function (c, i) {
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'film-chapter'; b.dataset.index = String(i);
        b.innerHTML = '<span class="film-chapter__n"></span><span class="film-chapter__t"></span><span class="film-chapter__at"></span>';
        b.children[0].textContent = (i < 9 ? '0' : '') + (i + 1);
        b.children[1].textContent = c.title;
        b.children[2].textContent = fmt(c.start);
        b.setAttribute('aria-label', 'Play chapter ' + (i + 1) + ': ' + c.title + ', at ' + fmt(c.start));
        b.addEventListener('click', function () { seekTo(c.start); });
        li.appendChild(b); chapterList.appendChild(li);
      });
    }
    // "Watch this part" links anywhere on the page
    Array.prototype.forEach.call(document.querySelectorAll('[data-film-chapter]'), function (a) {
      var c = chapterById(a.dataset.filmChapter); if (!c) return;
      var at = a.querySelector('[data-film-at]'); if (at) at.textContent = fmt(c.start);
    });
    paintTicks(); paintChapter(video.currentTime);
  }
  function chapterById(id) { for (var i = 0; i < chapters.length; i++) if (chapters[i].id === id) return chapters[i]; return null; }
  function paintTicks() {
    var d = duration(); ticks.textContent = '';
    if (!d) return;
    chapters.forEach(function (c) {
      if (c.start <= 0.05 || c.start >= d) return;
      var i = document.createElement('i'); i.style.left = (c.start / d) * 100 + '%'; ticks.appendChild(i);
    });
  }
  function paintChapter(t) {
    var idx = -1;
    for (var i = 0; i < chapters.length; i++) if (t >= chapters[i].start - 0.01) idx = i;
    if (idx === activeChapter) return;
    activeChapter = idx;
    if (chapterList) Array.prototype.forEach.call(chapterList.querySelectorAll('.film-chapter'), function (b, i) {
      b.classList.toggle('is-active', i === idx);
      if (i === idx) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    paintNow();
  }
  function paintNow() {
    if (!nowEl) return;
    var started = screen.classList.contains('has-started') && !screen.classList.contains('has-ended');
    nowEl.textContent = started && activeChapter >= 0 ? chapters[activeChapter].title : nowEl.dataset.idle || '';
  }
  function seekTo(t) {
    var go = function () { video.currentTime = Math.min(t, Math.max(0, duration() - 0.25)); play(); paintTime(); };
    if (video.readyState >= 1) go(); else { video.addEventListener('loadedmetadata', go, { once: true }); video.load(); }
  }
  function reveal() {
    var r = slot.getBoundingClientRect();
    if (r.top < 72 || r.bottom > window.innerHeight) frame.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-film-chapter], [data-film-play]');
    if (!a) return;
    e.preventDefault();
    reveal();
    if (a.hasAttribute('data-film-chapter')) { var c = chapterById(a.dataset.filmChapter); seekTo(c ? c.start : 0); }
    else if (video.paused) play();
    try { (screen.classList.contains('has-started') ? toggleBtn : bigplay).focus({ preventScroll: true }); } catch (_) {}
  });

  /* ---------- docking ---------- */
  function updateDock() {
    var should = !video.paused && !video.ended && !dockDismissed && slotRatio < 0.35
      && window.matchMedia('(min-width: 821px)').matches && !document.fullscreenElement;
    if (should === screen.classList.contains('is-docked')) return;
    screen.classList.toggle('is-docked', should);
    frame.classList.toggle('has-dock', should);              // lifts the bezel's stacking context (css/film.css)
    slot.classList.toggle('is-empty', should);
    if (should) slot.style.backgroundImage = 'url("' + video.getAttribute('poster') + '")'; else slot.style.backgroundImage = '';
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      slotRatio = entries[0].intersectionRatio; frameVisible = entries[0].isIntersecting; updateDock();
      frame.classList.toggle('is-offscreen', !frameVisible);
      if (frameVisible && energy > 0.01) startWave();
    }, { threshold: [0, 0.35, 0.36, 1] }).observe(slot);
  }
  window.addEventListener('resize', function () { updateDock(); measureNode(); });
  if (dockClose) dockClose.addEventListener('click', function (e) { e.stopPropagation(); dockDismissed = true; video.pause(); updateDock(); });

  /* ---------- the string ---------- */
  var paths = frame.querySelectorAll('.film-frame__string path');
  var node = frame.querySelector('.film-frame__node');
  var stringEl = frame.querySelector('.film-frame__string');
  var N = 72, W = 1000, MID = 12, MODES = 6, F0 = 1.35, B = 0.012, PLUCK_AT = 0.2, AMP = 7;
  var energy = 0, sustain = 0, sustainTarget = 0, pluckedAt = 0, waveRaf = 0, frameVisible = true, nodeU = 0.575, lastT = 0;

  function measureNode() {
    if (!stringEl || !node) return;
    var s = stringEl.getBoundingClientRect(), f = frame.getBoundingClientRect();
    if (s.width) nodeU = (f.left + f.width * 0.58 - s.left) / s.width;
  }
  function displacement(u, t) {
    var y = 0, age = t - pluckedAt;
    for (var n = 1; n <= MODES; n++) {
      // A plucked string's spectrum, sin(nπp)/n²; upper partials die first, as they do on a piano.
      var a = Math.sin(n * Math.PI * PLUCK_AT) / (n * n);
      var w = Math.max(sustain, Math.exp(-age * (0.35 + 0.3 * n)));
      y += a * w * Math.sin(n * Math.PI * u) * Math.cos(2 * Math.PI * F0 * n * Math.sqrt(1 + B * n * n) * age);
    }
    return y * AMP * energy * 2.2;
  }
  function draw(t) {
    var d = 'M0 ' + MID;
    for (var i = 1; i <= N; i++) { var u = i / N; d += 'L' + (u * W).toFixed(1) + ' ' + (MID + displacement(u, t)).toFixed(2); }
    for (var p = 0; p < paths.length; p++) paths[p].setAttribute('d', d);
    if (node) node.style.setProperty('--node-y', displacement(nodeU, t).toFixed(2) + 'px');
  }
  function tick(now) {
    var t = now / 1000, dt = Math.min(0.05, t - lastT); lastT = t;
    var target = frame.classList.contains('is-playing') ? 1 : 0;
    // While playing the string is kept gently alive; released, it rings out.
    if (target) energy += (1 - energy) * Math.min(1, dt * 6); else energy *= Math.exp(-dt / 0.55);
    sustain += (sustainTarget - sustain) * Math.min(1, dt * 2.5);
    draw(t);
    if (energy > 0.004 && frameVisible) waveRaf = requestAnimationFrame(tick);
    else { waveRaf = 0; if (energy <= 0.004) { energy = 0; draw(t); } }
  }
  function startWave() { if (!waveRaf && !reduceMotion.matches && paths.length) { lastT = performance.now() / 1000; waveRaf = requestAnimationFrame(tick); } }
  function pluck(strength) {
    if (reduceMotion.matches) return;
    pluckedAt = performance.now() / 1000; energy = Math.max(energy, strength); sustainTarget = strength >= 1 ? 0.2 : 0; startWave();
  }
  function release() { sustainTarget = 0; startWave(); }
  frame.addEventListener('pointerenter', function () { if (video.paused && energy < 0.1) pluck(0.45); });
  measureNode();

  /* ---------- boot ---------- */
  video.controls = false; video.removeAttribute('controls');   // the markup ships native controls for the no-JS case
  screen.classList.add('is-paused');
  if (nowEl) nowEl.dataset.idle = nowEl.textContent;
  if (video.readyState >= 1) video.dispatchEvent(new Event('loadedmetadata'));
  loadChapters();

  if ('mediaSession' in navigator && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Resonance — the film', artist: 'Resonance Piano Tuner',
      artwork: [{ src: video.getAttribute('poster'), sizes: '1280x720', type: 'image/webp' }]
    });
  }

  window.ResonanceFilm = { play: play, pause: function () { video.pause(); }, seekToChapter: function (id) { var c = chapterById(id); reveal(); seekTo(c ? c.start : 0); }, get chapters() { return chapters.slice(); } };
})();
