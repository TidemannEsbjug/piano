/* intro.js — the app's launch intro (App/Views/Shell/IntroView.swift) as the site loader.
   Loaded synchronously right after the .intro markup so the film starts before the page is parsed.
   Every timing is the app's own value divided by SPEED; assets/video/intro-loader.* is Intro.mp4
   re-encoded at the same factor, so picture and title stay in step. */
(function () {
  'use strict';

  var SPEED = 1.5;
  var APP = {            // seconds, straight from IntroView.swift
    skipDelay: 0.6, skipFade: 0.8,
    titleAt: 5.5, titleFade: 0.95,
    holdAfterEnd: 1.8, fadeOut: 0.7,
    stillTitleFade: 0.5, stillHold: 2.2   // the Reduce Motion path: poster + wordmark
  };
  var ms = function (appSeconds) { return Math.round(appSeconds / SPEED * 1000); };
  var STALL_MS = 3000;   // no first frame by then → fall back to the still

  var root = document.documentElement;
  var el = document.getElementById('intro');
  if (!el) return;
  var plate = el.querySelector('.intro__plate');
  var skip = el.querySelector('.intro__skip');
  var page = null, video = null, raf = 0, timers = [], active = false, titled = false, touchY = null;

  el.style.setProperty('--intro-fade', ms(APP.fadeOut) + 'ms');
  el.style.setProperty('--intro-skip-fade', ms(APP.skipFade) + 'ms');
  if (window.matchMedia('(pointer: coarse)').matches) skip.textContent = 'Tap to skip';

  function later(fn, delay) { var t = setTimeout(fn, delay); timers.push(t); return t; }

  function showTitle(fadeMs) {
    if (titled) return;
    titled = true;
    el.style.setProperty('--intro-title-fade', fadeMs + 'ms');
    plate.classList.add('is-in');
  }

  // Reduce Motion, Save-Data, blocked autoplay or a stalled download: poster + wordmark, then in.
  function playStill() {
    if (!active) return;
    cancelAnimationFrame(raf);
    if (video) {                                 // stop the download too: the still does not need it
      video.pause(); video.classList.remove('is-playing'); video.preload = 'none';
      while (video.firstChild) video.removeChild(video.firstChild);
      video.removeAttribute('src'); video.load();
    }
    showTitle(ms(APP.stillTitleFade));
    later(finish, ms(APP.stillHold));
  }

  function playFilm() {
    video = document.createElement('video');
    video.className = 'intro__media';
    video.muted = true; video.defaultMuted = true; video.playsInline = true;
    video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true'); video.tabIndex = -1;
    video.disablePictureInPicture = true; video.preload = 'auto';
    // Cover-fit on a tall phone needs the 720p file; the 480p one is for small windows and slow links.
    var need = Math.max(window.innerHeight, window.innerWidth * 9 / 16) * (window.devicePixelRatio || 1);
    var slow = navigator.connection && /2g|3g/.test(navigator.connection.effectiveType || '');
    var small = slow || need <= 560;
    var sources = small
      ? [['assets/video/intro-loader-sm.mp4', 'video/mp4']]
      : [['assets/video/intro-loader.webm', 'video/webm; codecs="vp9"'], ['assets/video/intro-loader.mp4', 'video/mp4']];
    sources.forEach(function (s) {
      var source = document.createElement('source'); source.src = s[0]; source.type = s[1]; video.appendChild(source);
    });
    el.insertBefore(video, el.querySelector('.intro__shade'));

    var stall = later(playStill, STALL_MS);
    video.addEventListener('playing', function () {
      clearTimeout(stall);
      video.classList.add('is-playing');
      // The wordmark is cued off the picture, not the wall clock, so buffering cannot desync it.
      (function watch() {
        if (!active || titled) return;
        if (video.currentTime >= APP.titleAt / SPEED) showTitle(ms(APP.titleFade));
        else raf = requestAnimationFrame(watch);
      })();
    }, { once: true });
    video.addEventListener('ended', function () { showTitle(ms(APP.titleFade)); later(finish, ms(APP.holdAfterEnd)); }, { once: true });
    video.addEventListener('error', playStill, { once: true });
    video.lastElementChild.addEventListener('error', playStill, { once: true });

    var started = video.play();
    if (started && started.catch) started.catch(playStill);
  }

  function onKey(e) {
    // Esc, Space, Return, keypad Enter — the same keys the app listens for.
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') { e.preventDefault(); finish(); }
  }
  function onWheel(e) { if (Math.abs(e.deltaY) > 8) finish(); }
  function onTouchStart(e) { touchY = e.touches[0].clientY; }
  function onTouchMove(e) { if (touchY !== null && Math.abs(e.touches[0].clientY - touchY) > 24) finish(); }

  function listen(on) {
    var fn = on ? 'addEventListener' : 'removeEventListener';
    window[fn]('keydown', onKey, true);
    el[fn]('click', finish);
    el[fn]('wheel', onWheel, { passive: true });
    el[fn]('touchstart', onTouchStart, { passive: true });
    el[fn]('touchmove', onTouchMove, { passive: true });
  }

  function setPageInert(inert) {
    page = page || document.getElementById('page');
    if (page) page.inert = inert;
    var skipLink = document.querySelector('.skip-link'); if (skipLink) skipLink.inert = inert;
  }

  function start() {
    if (active) return;
    active = true; titled = false;
    root.classList.remove('intro-off'); root.classList.add('intro-on');
    el.hidden = false; el.classList.remove('is-leaving');
    plate.classList.remove('is-in'); skip.classList.remove('is-in');
    setPageInert(true);
    listen(true);
    later(function () { skip.classList.add('is-in'); }, ms(APP.skipDelay));
    try { el.focus({ preventScroll: true }); } catch (_) {}   // the overlay itself, as the app does (focusEffectDisabled)

    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || (navigator.connection && navigator.connection.saveData);
    if (still) playStill(); else playFilm();
  }

  function finish() {
    if (!active) return;
    active = false;
    timers.forEach(clearTimeout); timers = [];
    cancelAnimationFrame(raf);
    listen(false);
    if (video) video.pause();
    try { sessionStorage.setItem('resonance.intro', 'done'); } catch (_) {}
    el.classList.add('is-leaving');
    root.classList.remove('intro-on');
    root.classList.add('is-entered');          // the hero must not depend on main.js having loaded
    setPageInert(false);
    document.dispatchEvent(new CustomEvent('resonance:intro-done'));
    setTimeout(function () {
      if (active) return;                       // replayed during the fade
      el.hidden = true;
      if (video) { video.removeAttribute('src'); while (video.firstChild) video.removeChild(video.firstChild); video.load(); video.remove(); video = null; }
    }, ms(APP.fadeOut) + 60);
  }

  window.ResonanceIntro = {
    replay: function () { window.scrollTo(0, 0); start(); },
    finish: finish,
    get active() { return active; }
  };

  if (root.classList.contains('intro-on')) {
    // Behind the password gate (js/gate.js) the intro waits, so it plays for someone actually looking.
    if (window.ResonanceGate && window.ResonanceGate.locked) document.addEventListener('resonance:unlocked', start, { once: true });
    else start();
    document.addEventListener('DOMContentLoaded', function () { if (active) setPageInert(true); });
  } else {
    el.hidden = true;
  }
})();
