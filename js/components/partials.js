/* partials.js — "A piano string is not a textbook string": an interactive explainer of inharmonicity.
   View 1: the partial ladder n = 1…8 (textbook tick n·f1 vs the real, sharper partial).
   View 2: why octaves get stretched (2:1 / 4:2 / 6:3 coincidences, mismatch in cents, beat in Hz).
   All numbers are computed live from the app's one shared model (TunerCore Model/Inharmonicity.swift:19-37):
     R_n(B) = sqrt((1 + B n^2) / (1 + B)),  p_n = f1 · n · R_n(B),  offset = 1200·log2 R_n(B).
   The B values are the app's default prior (Curve/InharmonicityModel.swift:5-32) — illustrative, not a recording.
   Silent by design: no audio of any kind. */
(function () {
  'use strict';

  /* Research maths.md §2a-d, §3b. nStar: Model/AnalysisSettings.swift:174-180; nMax: :57-59,152-157;
     "lead" = dominant octave family of the Standard style for that lower key (6:3 ≤ 24, 4:2 25–58, 2:1 ≥ 59). */
  var NOTES = [
    { name: 'A1', upper: 'A2', f1: 55.0,   B: 2.07e-4, Bup: 2.39e-4, nStar: 6, nMax: 12, lead: '6:3' },
    { name: 'C4', upper: 'C5', f1: 261.63, B: 4.0e-4,  Bup: 7.77e-4, nStar: 2, nMax: 10, lead: '4:2' },
    { name: 'C7', upper: 'C8', f1: 2093.0, B: 5.94e-3, Bup: 2.32e-2, nStar: 1, nMax: 3,  lead: '2:1' }
  ];
  var FAMILIES = [{ m: 2, n: 1 }, { m: 4, n: 2 }, { m: 6, n: 3 }];
  var B_MIN = 1e-5, B_MAX = 3e-2;                      /* Model/Inharmonicity.swift:11-16 (clamp) */
  var PARTIAL_CEILING_HZ = 6000;                       /* Curve/StretchConstraints.swift:76-77 (min(0.4 fs, 6 kHz)) */
  var LADDER_SCALES = [25, 50, 100, 200, 300, 500, 1000];
  var STRETCH_SCALES = [8, 10, 15, 20, 30, 50, 100, 200, 300, 500, 1000, 2000];
  var T_STATE = 200, T_SCALE = 250;                    /* Theme.Motion: 200 ms state, 250 ms scale change */
  var STRIKE_PERIOD = 6;                               /* s between the silent, purely visual "strikes" */
  var ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
  var uid = 0;

  function R(n, B) { return Math.sqrt((1 + B * n * n) / (1 + B)); }
  function centsOf(ratio) { return 1200 * Math.log(ratio) / Math.LN2; }
  function offsetCents(n, B) { return centsOf(R(n, B)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function log10(v) { return Math.log(v) / Math.LN10; }
  function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }   /* easeInOut, no overshoot */
  function pick(list, v) { for (var i = 0; i < list.length; i++) if (list[i] >= v) return list[i]; return list[list.length - 1]; }

  function fmtCents(c) {
    if (Math.abs(c) < 0.005) return '0.00¢';
    return (c > 0 ? '+' : '−') + Math.abs(c).toFixed(2) + '¢';
  }
  function fmtB(B) {                                   /* app format: 4.1e-4 */
    var e = Math.floor(log10(B)), m = (B / Math.pow(10, e)).toFixed(1);
    if (m === '10.0') { m = '1.0'; e += 1; }
    return m + 'e' + e;
  }
  function fmtHz(f) { return f.toFixed(f >= 10000 ? 0 : f >= 1000 ? 1 : 2) + ' Hz'; }
  function fmtBeat(f) { return f.toFixed(f >= 100 ? 0 : f >= 10 ? 1 : 2) + ' Hz'; }
  function semitoneWords(c) {
    if (c === 25) return 'a quarter of a semitone';
    if (c === 50) return 'half a semitone';
    if (c === 100) return 'one semitone';
    return (c / 100) + ' semitones';
  }

  function h(tag, cls, text, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  function mount(el, env) {
    var T = env.tokens, FONT = env.fonts || { ui: 'sans-serif' };
    var id = 'rc-partials-' + (++uid);
    var fb = el.querySelector('.rc-fallback'); if (fb) fb.parentNode.removeChild(fb);
    if (el.closest && el.closest('.panel')) el.classList.add('rc-partials--in-panel');

    var state = { note: 1, B: NOTES[1].B, Bup: NOTES[1].Bup, s: 0 };
    var disp = { logB: log10(state.B), logBup: log10(state.Bup), lScale: 25, s: 0, sScale: 8 };
    var target = { lScale: 25, sScale: 8 };
    var tweens = {};
    var active = false, rafId = 0, lastNow = 0, animT = 0, destroyed = false, ariaTimer = 0;

    /* ---------------- DOM ---------------- */
    var frame = h('div', 'rc-partials__frame');

    /* View 1 — the ladder */
    var sec1 = h('section', 'rc-partials__sec', null, { 'aria-label': 'The partial ladder' });
    var head = h('div', 'rc-partials__head');
    var seg = h('div', 'rc-partials__seg', null, { role: 'group', 'aria-label': 'Note' });
    var noteBtns = NOTES.map(function (nt, i) {
      var b = h('button', 'rc-partials__segbtn', null, { type: 'button', 'aria-pressed': 'false' });
      b.appendChild(h('span', 'rc-partials__segnote', nt.name));
      b.appendChild(h('span', 'rc-partials__segsub', 'B ' + fmtB(nt.B)));
      b.setAttribute('aria-label', nt.name + ', B ' + fmtB(nt.B));
      b.addEventListener('click', function () { setNote(i); });
      seg.appendChild(b);
      return b;
    });
    var chip = h('span', 'chip rc-partials__listen');
    chip.appendChild(h('i', 'rc-partials__node', null, { 'aria-hidden': 'true' }));
    var chipText = h('span', null, '');
    chip.appendChild(chipText);
    head.appendChild(seg); head.appendChild(chip);

    var ladWrap = h('div', 'rc-partials__ladder');
    var ladCanvas = h('canvas', 'rc-partials__canvas', null, { role: 'img', 'aria-label': '' });
    var table = h('div', 'rc-partials__table', null, { role: 'table', 'aria-label': 'Partials 1 to 8: the textbook multiple and the real partial' });
    var headRow = h('div', 'rc-partials__row rc-partials__row--head', null, { role: 'row' });
    headRow.appendChild(h('span', 'rc-partials__c-n', 'n', { role: 'columnheader' }));
    var headTrack = h('span', 'rc-partials__c-track', null, { role: 'columnheader' });
    headTrack.appendChild(h('i', 'rc-partials__key rc-partials__key--tick', null, { 'aria-hidden': 'true' }));
    headTrack.appendChild(h('span', null, 'textbook'));
    headTrack.appendChild(h('i', 'rc-partials__key rc-partials__key--real', null, { 'aria-hidden': 'true' }));
    var realWord = h('span', null, 'real');
    realWord.appendChild(h('span', 'rc-partials__wide', ' partial'));
    headTrack.appendChild(realWord);
    headRow.appendChild(headTrack);
    headRow.appendChild(h('span', 'rc-partials__c-cents', 'offset', { role: 'columnheader' }));
    headRow.appendChild(h('span', 'rc-partials__c-hz', 'frequency', { role: 'columnheader' }));
    table.appendChild(headRow);
    var rows = [];
    for (var n = 1; n <= 8; n++) {
      var row = h('div', 'rc-partials__row', null, { role: 'row' });
      var cn = h('span', 'rc-partials__c-n', null, { role: 'cell' });
      cn.appendChild(h('span', null, String(n)));
      var cnNote = h('span', 'visually-hidden', ''); cn.appendChild(cnNote);
      var ct = h('span', 'rc-partials__c-track', null, { role: 'cell' });
      var ctText = h('span', 'visually-hidden', ''); ct.appendChild(ctText);
      var cc = h('span', 'rc-partials__c-cents', '', { role: 'cell', 'aria-live': 'off' });
      var chz = h('span', 'rc-partials__c-hz', '', { role: 'cell', 'aria-live': 'off' });
      row.appendChild(cn); row.appendChild(ct); row.appendChild(cc); row.appendChild(chz);
      table.appendChild(row);
      rows.push({ el: row, note: cnNote, textbook: ctText, cents: cc, hz: chz });
    }
    var axisRow = h('div', 'rc-partials__row rc-partials__row--axis', null, { 'aria-hidden': 'true' });
    table.appendChild(axisRow);
    ladWrap.appendChild(ladCanvas); ladWrap.appendChild(table);

    var scaleNote = h('p', 'rc-partials__scale');

    var bBox = h('div', 'rc-partials__control');
    var bHead = h('div', 'rc-partials__controlhead');
    var bLabel = h('label', 'rc-partials__label', null, { 'for': id + '-b' });
    bLabel.appendChild(document.createTextNode('Stiffness '));
    bLabel.appendChild(h('i', null, 'B'));
    var bOut = h('output', 'rc-partials__value', '', { 'for': id + '-b', 'aria-live': 'off' });
    var bReset = h('button', 'rc-partials__reset', 'Reset', { type: 'button' });
    var bPause = h('button', 'rc-partials__pause', 'Pause', { type: 'button', 'aria-pressed': 'false', 'aria-label': 'Pause the animation' });
    bPause.hidden = !!env.reduceMotion;
    bHead.appendChild(bLabel); bHead.appendChild(bOut); bHead.appendChild(bReset); bHead.appendChild(bPause);
    var bRange = h('input', 'rc-partials__range rc-partials__range--b', null, {
      type: 'range', id: id + '-b', min: String(log10(B_MIN)), max: log10(B_MAX).toFixed(3), step: '0.01'
    });
    var bEnds = h('div', 'rc-partials__ends', null, { 'aria-hidden': 'true' });
    bEnds.appendChild(h('span', null, 'textbook string'));
    var bTick = h('span', 'rc-partials__default');
    bEnds.appendChild(bTick);
    bEnds.appendChild(h('span', null, 'very stiff'));
    bBox.appendChild(bHead); bBox.appendChild(bRange); bBox.appendChild(bEnds);

    sec1.appendChild(head); sec1.appendChild(ladWrap); sec1.appendChild(scaleNote); sec1.appendChild(bBox);

    /* View 2 — why octaves get stretched */
    var sec2 = h('section', 'rc-partials__sec rc-partials__sec--oct', null, { 'aria-labelledby': id + '-h' });
    sec2.appendChild(h('h3', 'rc-partials__title', 'Why octaves get stretched', { id: id + '-h' }));
    var octIntro = h('p', 'rc-partials__intro');
    sec2.appendChild(octIntro);

    var octWrap = h('div', 'rc-partials__oct');
    var octCanvas = h('canvas', 'rc-partials__canvas', null, { role: 'img', 'aria-label': '' });
    var octTable = h('div', 'rc-partials__table', null, { role: 'table', 'aria-label': 'Octave coincidences: mismatch and beat rate' });
    var octHead = h('div', 'rc-partials__orow rc-partials__orow--head', null, { role: 'row' });
    var ohPair = h('span', 'rc-partials__o-pair', null, { role: 'columnheader' });
    ohPair.appendChild(h('span', 'rc-partials__wide', 'coincidence'));
    ohPair.appendChild(h('span', 'visually-hidden rc-partials__narrowonly', 'pair'));
    octHead.appendChild(ohPair);
    var octHeadTrack = h('span', 'rc-partials__o-track', null, { role: 'columnheader' });
    octHeadTrack.appendChild(h('i', 'rc-partials__key rc-partials__key--real', null, { 'aria-hidden': 'true' }));
    var ohLower = h('span', null, ''); octHeadTrack.appendChild(ohLower);
    octHeadTrack.appendChild(h('i', 'rc-partials__key rc-partials__key--upper', null, { 'aria-hidden': 'true' }));
    var ohUpper = h('span', null, ''); octHeadTrack.appendChild(ohUpper);
    octHead.appendChild(octHeadTrack);
    var octHeadStrip = h('span', 'rc-partials__o-strip', 'beat', { role: 'columnheader' });
    octHead.appendChild(octHeadStrip);
    octHead.appendChild(h('span', 'rc-partials__o-num', 'rate', { role: 'columnheader' }));
    octTable.appendChild(octHead);
    var orows = FAMILIES.map(function (fam) {
      var r = h('div', 'rc-partials__orow', null, { role: 'row' });
      var pair = h('span', 'rc-partials__o-pair', null, { role: 'cell' });
      pair.appendChild(h('b', null, fam.m + ':' + fam.n));
      var pairSub = h('span', 'rc-partials__pairsub', ''); pair.appendChild(pairSub);
      var trk = h('span', 'rc-partials__o-track', null, { role: 'cell' });
      var trkText = h('span', 'visually-hidden', ''); trk.appendChild(trkText);
      var strip = h('span', 'rc-partials__o-strip', null, { role: 'cell', 'aria-hidden': 'true' });
      var num = h('span', 'rc-partials__o-num', null, { role: 'cell', 'aria-live': 'off' });
      var beat = h('span', 'rc-partials__beat', ''); var mis = h('span', 'rc-partials__mis', '');
      num.appendChild(beat); num.appendChild(mis);
      r.appendChild(pair); r.appendChild(trk); r.appendChild(strip); r.appendChild(num);
      octTable.appendChild(r);
      return { el: r, pairSub: pairSub, trkText: trkText, strip: strip, beat: beat, mis: mis };
    });
    var octAxis = h('div', 'rc-partials__orow rc-partials__orow--axis', null, { 'aria-hidden': 'true' });
    octTable.appendChild(octAxis);
    octWrap.appendChild(octCanvas); octWrap.appendChild(octTable);

    var sRowEl = h('div', 'rc-partials__orow rc-partials__orow--slider');
    sRowEl.appendChild(h('span', 'rc-partials__o-pair'));
    var sCell = h('span', 'rc-partials__o-track');
    var sRange = h('input', 'rc-partials__range rc-partials__range--s', null, { type: 'range', id: id + '-s', min: '0', max: '8', step: '0.01', value: '0' });
    sCell.appendChild(sRange);
    sRowEl.appendChild(sCell);
    sRowEl.appendChild(h('span', 'rc-partials__o-strip'));
    sRowEl.appendChild(h('span', 'rc-partials__o-num'));

    var sHead = h('div', 'rc-partials__controlhead');
    var sLabel = h('label', 'rc-partials__label', 'Octave width', { 'for': id + '-s' });
    var sOut = h('output', 'rc-partials__value', '', { 'for': id + '-s', 'aria-live': 'off' });
    sHead.appendChild(sLabel); sHead.appendChild(sOut);

    var presets = h('div', 'rc-partials__presets', null, { role: 'group', 'aria-label': 'Octave width presets' });
    var presetBtns = [];
    (function () {
      var b0 = h('button', 'rc-partials__preset', null, { type: 'button', 'aria-pressed': 'true' });
      b0.appendChild(h('span', null, 'Exact 2.000'));
      b0.appendChild(h('span', 'rc-partials__presetsub', '0.00¢'));
      b0.addEventListener('click', function () { setStretch(0, true); });
      presets.appendChild(b0);
      presetBtns.push({ el: b0, sub: null, fam: null });
      FAMILIES.forEach(function (fam, i) {
        var b = h('button', 'rc-partials__preset', null, { type: 'button', 'aria-pressed': 'false' });
        b.appendChild(h('span', null, fam.m + ':' + fam.n + ' pure'));
        var sub = h('span', 'rc-partials__presetsub', ''); b.appendChild(sub);
        b.addEventListener('click', function () { var o = octave(); if (o.rows[i].eligible) setStretch(o.rows[i].d, true); });
        presets.appendChild(b);
        presetBtns.push({ el: b, sub: sub, fam: i });
      });
    })();
    var leadNote = h('p', 'rc-partials__lead');

    sec2.appendChild(sHead); sec2.appendChild(octWrap); sec2.appendChild(sRowEl); sec2.appendChild(presets); sec2.appendChild(leadNote);

    var caveat = h('p', 'rc-partials__caveat');

    frame.appendChild(sec1); frame.appendChild(sec2); frame.appendChild(caveat);
    el.appendChild(frame);

    /* ---------------- Model ---------------- */
    function note() { return NOTES[state.note]; }
    function octave(B, Bup, s) {
      var nt = note();
      if (B == null) { B = state.B; Bup = state.Bup; s = state.s; }
      var f1up = 2 * nt.f1 * Math.pow(2, s / 1200);
      var out = { f1up: f1up, rows: [], maxD: 0 };
      FAMILIES.forEach(function (fam) {
        var pm = nt.f1 * fam.m * R(fam.m, B);
        var pn = f1up * fam.n * R(fam.n, Bup);
        var d = centsOf(R(fam.m, B) / R(fam.n, Bup));          /* d_inh, Curve/StretchConstraints.swift:105 */
        var eligible = fam.m <= nt.nMax && pm <= PARTIAL_CEILING_HZ;
        if (eligible && d > out.maxD) out.maxD = d;
        out.rows.push({ d: d, pm: pm, pn: pn, mismatch: s - d, beat: Math.abs(pm - pn), eligible: eligible,
          reason: pm > PARTIAL_CEILING_HZ ? 'above 6 kHz' : 'n > ' + nt.nMax });
      });
      return out;
    }
    function upperB(B) { var nt = note(); return clamp(nt.Bup * B / nt.B, B_MIN, B_MAX); }

    /* ---------------- Animation plumbing ---------------- */
    var paused = false;
    function looping() { return active && !paused && !env.reduceMotion && !destroyed; }
    function tweenTo(key, to, dur) {
      if (!looping() || disp[key] === to) { disp[key] = to; delete tweens[key]; return; }
      tweens[key] = { from: disp[key], to: to, t0: -1, dur: dur };   /* t0 is taken from the rAF clock on the first step */
    }
    function stepTweens(now) {
      for (var key in tweens) {
        var tw = tweens[key]; if (tw.t0 < 0) tw.t0 = now;
        var p = (now - tw.t0) / tw.dur;
        if (p >= 1) { disp[key] = tw.to; delete tweens[key]; }
        else disp[key] = tw.from + (tw.to - tw.from) * ease(Math.max(0, p));
        if (key === 's') sRange.value = String(disp.s);
      }
    }
    function settle() { for (var key in tweens) { disp[key] = tweens[key].to; delete tweens[key]; } sRange.value = String(state.s); }
    function frameTick(now) {
      rafId = 0;
      if (!looping()) return;
      var dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
      lastNow = now; animT += dt;
      stepTweens(now);
      draw();
      rafId = requestAnimationFrame(frameTick);
    }
    function start() { if (!rafId && looping()) { lastNow = 0; rafId = requestAnimationFrame(frameTick); } }
    function stop() { if (rafId) cancelAnimationFrame(rafId); rafId = 0; settle(); }
    function invalidate() { if (!rafId) draw(); }
    bPause.addEventListener('click', function () {
      paused = !paused;
      bPause.setAttribute('aria-pressed', String(paused)); bPause.textContent = paused ? 'Play' : 'Pause';
      bPause.setAttribute('aria-label', paused ? 'Play the animation' : 'Pause the animation');
      if (paused) { stop(); draw(); } else start();
    });

    /* ---------------- State changes ---------------- */
    function rescale() {
      target.lScale = pick(LADDER_SCALES, offsetCents(8, state.B));
      tweenTo('lScale', target.lScale, T_SCALE);
      var o = octave();
      target.sScale = pick(STRETCH_SCALES, Math.max(8, o.maxD * 1.15));
      tweenTo('sScale', target.sScale, T_SCALE);
      sRange.max = String(target.sScale);
      sRange.step = target.sScale <= 20 ? '0.01' : target.sScale <= 200 ? '0.1' : '1';
      if (state.s > target.sScale) { state.s = target.sScale; delete tweens.s; disp.s = state.s; }
      sRange.value = String(tweens.s ? disp.s : state.s);
    }
    function setNote(i) {
      state.note = i; state.B = NOTES[i].B; state.Bup = NOTES[i].Bup; state.s = 0;
      bRange.value = log10(state.B).toFixed(2);
      tweenTo('logB', log10(state.B), T_STATE); tweenTo('logBup', log10(state.Bup), T_STATE); tweenTo('s', 0, T_STATE);
      rescale(); syncText(); invalidate(); scheduleAria();
    }
    function setB(B, fromSlider) {
      state.B = clamp(B, B_MIN, B_MAX); state.Bup = upperB(state.B);
      if (fromSlider) { delete tweens.logB; delete tweens.logBup; disp.logB = log10(state.B); disp.logBup = log10(state.Bup); }
      else { bRange.value = log10(state.B).toFixed(2); tweenTo('logB', log10(state.B), T_STATE); tweenTo('logBup', log10(state.Bup), T_STATE); }
      rescale(); syncText(); invalidate(); scheduleAria();
    }
    function setStretch(s, animate) {
      state.s = clamp(s, 0, target.sScale);
      if (animate) tweenTo('s', state.s, T_STATE); else { delete tweens.s; disp.s = state.s; }
      if (!tweens.s) sRange.value = String(state.s);
      syncText(); invalidate(); scheduleAria();
    }

    bRange.addEventListener('input', function () { setB(Math.pow(10, parseFloat(bRange.value)), true); });
    bReset.addEventListener('click', function () { setB(note().B, false); });
    sRange.addEventListener('input', function () { setStretch(parseFloat(sRange.value), false); });

    /* ---------------- Text ---------------- */
    function syncText() {
      var nt = note(), B = state.B, i;
      noteBtns.forEach(function (b, j) { b.setAttribute('aria-pressed', j === state.note ? 'true' : 'false'); });
      chipText.textContent = 'Resonance listens to partial ' + nt.nStar + ' · ' + fmtHz(nt.f1 * nt.nStar * R(nt.nStar, B));
      for (i = 0; i < 8; i++) {
        var n = i + 1, r = rows[i], p = nt.f1 * n * R(n, B), extrap = n > nt.nMax;
        r.cents.textContent = fmtCents(offsetCents(n, B));
        r.hz.textContent = fmtHz(p);
        r.textbook.textContent = 'textbook ' + fmtHz(nt.f1 * n);
        r.note.textContent = n === nt.nStar ? ' (the partial Resonance listens to)' : extrap ? ' (model only, not fitted by the app)' : '';
        r.el.classList.toggle('is-listen', n === nt.nStar);
        r.el.classList.toggle('is-extrap', extrap);
        r.el.classList.toggle('is-zero', n === 1);
      }
      var modified = Math.abs(log10(B) - log10(nt.B)) > 0.004;
      bOut.textContent = 'B = ' + fmtB(B);
      bRange.setAttribute('aria-valuetext', 'B = ' + fmtB(B));
      bReset.disabled = !modified;
      bReset.setAttribute('aria-label', 'Reset B to the ' + nt.name + ' default, ' + fmtB(nt.B));
      bTick.textContent = nt.name;
      bTick.style.setProperty('--p', String((log10(nt.B) - log10(B_MIN)) / (log10(B_MAX) - log10(B_MIN))));
      scaleNote.textContent = target.lScale <= 50
        ? 'Offsets are drawn magnified: the whole track is only ' + target.lScale + '¢, ' + semitoneWords(target.lScale) + '. The numbers are exact.'
        : 'Scale: the whole track is ' + target.lScale + '¢, ' + semitoneWords(target.lScale) + '. The numbers are exact.';

      var o = octave();
      var single = o.rows.filter(function (r) { return r.eligible; }).length === 1;
      octIntro.textContent = 'Tune ' + nt.upper + ' to exactly 2.000 × ' + nt.name + ' and ' + nt.name + '’s sharpened partials no longer meet ' + nt.upper +
        (single ? '’s, so the pair beats. Widen the octave until it goes quiet.' : '’s, so each pair beats. Widen the octave and one pair goes quiet. Never all of them.');
      ohLower.textContent = nt.name; ohUpper.textContent = nt.upper;
      sLabel.textContent = nt.upper + ' tuned';
      sOut.textContent = fmtCents(state.s).replace(/^0/, '+0') + ' wider than 2.000 · f₁ ' + fmtHz(o.f1up);
      sRange.setAttribute('aria-label', 'Octave width: cents wider than an exact 2.000 ratio');
      sRange.setAttribute('aria-valuetext', fmtCents(state.s) + ' wider than 2.000');
      o.rows.forEach(function (row, j) {
        var fam = FAMILIES[j], or = orows[j];
        or.pairSub.textContent = nt.name + '’s ' + ORD[fam.m] + ' · ' + nt.upper + '’s ' + ORD[fam.n];
        var pure = row.eligible && Math.abs(row.mismatch) < 0.02;
        or.el.classList.toggle('is-off', !row.eligible);
        or.el.classList.toggle('is-pure', pure);
        if (!row.eligible) {
          or.beat.textContent = 'not used'; or.mis.textContent = row.reason;
          or.trkText.textContent = 'not used by the app: ' + row.reason;
        } else {
          or.beat.textContent = fmtBeat(row.beat);
          or.mis.textContent = pure ? 'pure' : fmtCents(row.mismatch) + (row.mismatch < 0 ? ' flat' : ' sharp');
          or.trkText.textContent = 'needs ' + fmtCents(row.d) + ' of stretch to be beatless';
        }
        var pb = presetBtns[j + 1];
        pb.sub.textContent = row.eligible ? fmtCents(row.d) : 'not used';
        pb.el.disabled = !row.eligible;
        pb.el.setAttribute('aria-pressed', row.eligible && Math.abs(state.s - row.d) < 0.006 ? 'true' : 'false');
      });
      presetBtns[0].el.setAttribute('aria-pressed', state.s < 0.005 ? 'true' : 'false');
      var nEligible = o.rows.filter(function (r) { return r.eligible; }).length;
      leadNote.textContent = nEligible === 1
        ? 'This high up the solver can only use 2:1. It ignores partials above 6 kHz, and ' + nt.name + '’s 4th is already past that.'
        : 'Resonance does not pick one pair. Around ' + nt.name + ' it weights ' + nt.lead + ' most, balances the others, and solves all 88 keys together.';
      caveat.textContent = 'Illustrative, not a recording: B values come from the app’s default inharmonicity model. On your piano they are measured, string by string.' +
        (nt.nMax < 8 ? ' At ' + nt.name + ' the app fits only partials 1–' + nt.nMax + '; the greyed rows are the model carried further.' : '');
    }

    function applyAria() {
      ariaTimer = 0;
      var nt = note(), B = state.B, parts = [];
      for (var n = 2; n <= 8; n++) parts.push('partial ' + n + ' ' + fmtCents(offsetCents(n, B)).replace('¢', ' cents'));
      ladCanvas.setAttribute('aria-label', 'Partial ladder for ' + nt.name + ' with B = ' + fmtB(B) + '. Each real partial is drawn to the right of its textbook tick; the full track is ' +
        target.lScale + ' cents. Sharp of the exact multiple: ' + parts.join(', ') + '.');
      var o = octave(), bits = [];
      o.rows.forEach(function (row, j) {
        var fam = FAMILIES[j];
        bits.push(fam.m + ':' + fam.n + (row.eligible ? ' beats at ' + fmtBeat(row.beat) : ' is not used'));
      });
      octCanvas.setAttribute('aria-label', 'Octave ' + nt.name + ' to ' + nt.upper + ', tuned ' + fmtCents(state.s).replace('¢', ' cents') + ' wider than 2.000: ' + bits.join(', ') + '.');
    }
    function scheduleAria() { if (!ariaTimer) ariaTimer = setTimeout(applyAria, 300); }

    /* ---------------- Geometry (read only on resize, never in the rAF loop) ---------------- */
    var G = null, dpr = 1;
    function sizeCanvas(c, w, hh) {
      var pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(hh * dpr));
      if (c.width !== pw) c.width = pw;
      if (c.height !== ph) c.height = ph;
    }
    function measure() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      var lw = ladWrap.clientWidth, lh = ladWrap.clientHeight, ow = octWrap.clientWidth, oh = octWrap.clientHeight;
      if (!lw || !ow) return;
      sizeCanvas(ladCanvas, lw, lh); sizeCanvas(octCanvas, ow, oh);
      var cellX = headTrack.offsetLeft, cellW = headTrack.offsetWidth;
      var glyphW = cellW >= 340 ? 96 : cellW >= 240 ? 64 : 0;
      G = {
        lad: {
          w: lw, h: lh, glyphX: cellX, glyphW: glyphW,
          tx0: cellX + glyphW + (glyphW ? 14 : 6), tx1: cellX + cellW - 10,
          rows: rows.map(function (r) { return { y: r.el.offsetTop, h: r.el.offsetHeight }; }),
          axisY: axisRow.offsetTop, axisH: axisRow.offsetHeight
        },
        oct: {
          w: ow, h: oh, tx0: octHeadTrack.offsetLeft + 10, tx1: octHeadTrack.offsetLeft + octHeadTrack.offsetWidth - 10,   /* = slider thumb travel (20 px thumb) */
          sx: octHeadStrip.offsetLeft, sw: octHeadStrip.offsetWidth,
          rows: orows.map(function (r) { return { y: r.el.offsetTop, h: r.el.offsetHeight }; }),
          axisY: octAxis.offsetTop, axisH: octAxis.offsetHeight
        }
      };
    }

    /* ---------------- Drawing ---------------- */
    function rr(ctx, x, y, w, hh, r) {
      r = Math.min(r, w / 2, hh / 2);
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + hh - r); ctx.arcTo(x + w, y + hh, x + w - r, y + hh, r); ctx.lineTo(x + r, y + hh);
      ctx.arcTo(x, y + hh, x, y + hh - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
    }
    function vline(ctx, x, y0, y1) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
    function uiFont(px, weight) { return (weight || 500) + ' ' + px + 'px ' + FONT.ui; }

    /* The silent "strike": partial n rings and decays, higher partials die sooner (visual only). */
    function envelope(n) {
      if (env.reduceMotion) return 0.8;
      var tc = animT % STRIKE_PERIOD, tau = 2.6 / (1 + 0.22 * (n - 1));
      return Math.min(1, tc / 0.06) * Math.exp(-tc / tau);
    }

    function drawLadder() {
      var g = G.lad, ctx = ladCanvas.getContext('2d'), nt = note();
      var B = Math.pow(10, disp.logB), scale = disp.lScale;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, g.w, g.h);
      var top = g.rows[0].y, bottom = g.rows[7].y + g.rows[7].h, span = g.tx1 - g.tx0;
      function X(c) { return g.tx0 + clamp(c / scale, 0, 1.0) * span; }

      /* the row Resonance listens to */
      var ls = g.rows[nt.nStar - 1];
      ctx.globalAlpha = 0.07; ctx.fillStyle = T['in-tune']; rr(ctx, 0, ls.y + 1, g.w, ls.h - 2, 7); ctx.fill();

      /* cents grid, zooms with the scale (250 ms) */
      var step = target.lScale / 5, labelAll = span / 5 >= 40;
      ctx.lineWidth = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = uiFont(10.5, 600);
      for (var i = 0; i <= 5; i++) {
        var c = i * step; if (c / scale > 1.001) break;
        var x = Math.round(X(c)) + 0.5;
        ctx.globalAlpha = i === 0 ? 0.55 : 1; ctx.strokeStyle = i === 0 ? T['text-2'] : T.hairline;
        vline(ctx, x, top + 2, bottom + 4);
        if (labelAll || i === 0 || i === 5) {
          ctx.globalAlpha = 1; ctx.fillStyle = T['text-2'];
          ctx.fillText(i === 0 ? '0' : '+' + c + (i === 5 ? '¢' : ''), x, g.axisY + g.axisH / 2 + 2);
        }
      }

      /* the n² guide through the markers */
      ctx.globalAlpha = 0.28; ctx.strokeStyle = T.reference; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath();
      for (var k = 0; k <= 70; k++) {
        var nf = 1 + 7 * k / 70, idx = Math.min(6, Math.floor(nf - 1)), fr = nf - 1 - idx;
        var ya = g.rows[idx].y + g.rows[idx].h / 2, yb = g.rows[idx + 1].y + g.rows[idx + 1].h / 2;
        var px = X(offsetCents(nf, B)), py = ya + (yb - ya) * fr;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke(); ctx.setLineDash([]);

      for (var n = 1; n <= 8; n++) {
        var row = g.rows[n - 1], my = row.y + row.h / 2, extrap = n > nt.nMax;
        var e = extrap ? 0.25 : envelope(n), col = extrap ? T['text-2'] : T.reference;
        var x0 = Math.round(X(0)) + 0.5, xm = X(offsetCents(n, B));

        /* standing-wave glyph: mode n of the string */
        if (g.glyphW) {
          var gx0 = g.glyphX + 2, gw = g.glyphW - 4, A = Math.min(9, row.h * 0.3);
          var ph = env.reduceMotion ? 1 : Math.cos(2 * Math.PI * (0.7 + 0.18 * n) * animT);
          ctx.lineWidth = 1; ctx.strokeStyle = col;
          for (var sgn = -1; sgn <= 1; sgn += 2) {
            ctx.globalAlpha = extrap ? 0.14 : 0.2; ctx.beginPath();
            for (var u = 0; u <= gw; u += 2) { var yy = my + sgn * A * Math.sin(n * Math.PI * u / gw); if (u === 0) ctx.moveTo(gx0, yy); else ctx.lineTo(gx0 + u, yy); }
            ctx.stroke();
          }
          ctx.globalAlpha = extrap ? 0.4 : 0.35 + 0.6 * e; ctx.lineWidth = 1.5; ctx.beginPath();
          for (var u2 = 0; u2 <= gw; u2 += 2) { var y2 = my + A * (extrap ? 0.5 : 0.25 + 0.75 * e) * ph * Math.sin(n * Math.PI * u2 / gw); if (u2 === 0) ctx.moveTo(gx0, y2); else ctx.lineTo(gx0 + u2, y2); }
          ctx.stroke();
        }

        /* rung, textbook tick, displacement, real partial */
        ctx.globalAlpha = 1; ctx.strokeStyle = T.hairline; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(g.tx0, Math.round(my) + 0.5); ctx.lineTo(g.tx1, Math.round(my) + 0.5); ctx.stroke();
        ctx.strokeStyle = T['text-2']; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.95; vline(ctx, x0, my - 7, my + 7);
        ctx.globalAlpha = extrap ? 0.3 : 0.45; ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0, my); ctx.lineTo(xm, my); ctx.stroke();
        if (!extrap) { ctx.globalAlpha = 0.1 + 0.2 * e; ctx.fillStyle = col; rr(ctx, xm - 5.5, my - 11, 11, 22, 5.5); ctx.fill(); }
        ctx.globalAlpha = extrap ? 0.55 : 1; ctx.fillStyle = col; rr(ctx, xm - 1.75, my - 8, 3.5, 16, 1.75); ctx.fill();

        if (n === nt.nStar) {
          ctx.globalAlpha = 0.3; ctx.fillStyle = T['in-tune']; ctx.beginPath(); ctx.arc(xm, my, 7, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(xm, my, 3.5, 0, 6.2832); ctx.fill();
          ctx.font = uiFont(10.5, 700); ctx.textBaseline = 'middle';
          var word = span >= 200 ? 'Resonance listens here' : 'listens here', ww = ctx.measureText(word).width;
          if (xm + 14 + ww <= g.tx1) { ctx.textAlign = 'left'; ctx.fillText(word, xm + 14, my - 0.5); }
          else if (xm - 14 - ww >= g.tx0) { ctx.textAlign = 'right'; ctx.fillText(word, xm - 14, my - 0.5); }   /* no room either side: the chip above already says it */
        }
      }

      /* C7 and the like: rows the app does not fit */
      if (nt.nMax < 8) {
        var r0 = g.rows[nt.nMax], msg = span >= 200 ? 'n > ' + nt.nMax + ': model only, not fitted by the app' : 'model only';
        ctx.globalAlpha = 1; ctx.fillStyle = T['text-2']; ctx.font = uiFont(10.5, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        var mx = X(offsetCents(nt.nMax + 1, B));
        if (mx + 12 + ctx.measureText(msg).width > g.tx1) msg = 'model only';
        if (mx + 12 + ctx.measureText(msg).width <= g.tx1) ctx.fillText(msg, g.tx1, r0.y + r0.h / 2 - 0.5);
      }
      ctx.globalAlpha = 1;
    }

    function drawOctave() {
      var g = G.oct, ctx = octCanvas.getContext('2d'), nt = note();
      var B = Math.pow(10, disp.logB), Bup = Math.pow(10, disp.logBup), s = disp.s, scale = disp.sScale;
      var o = octave(B, Bup, s);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, g.w, g.h);
      var top = g.rows[0].y, bottom = g.rows[2].y + g.rows[2].h, span = g.tx1 - g.tx0;
      function X(c) { return g.tx0 + (c / scale) * span; }

      /* grid: cents wider than 2.000 */
      var step = target.sScale / 4;
      ctx.lineWidth = 1; ctx.font = uiFont(10.5, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var i = 0; i <= 4; i++) {
        var c = i * step; if (c / scale > 1.001) break;
        var x = Math.round(X(c)) + 0.5;
        ctx.globalAlpha = 1; ctx.strokeStyle = T.hairline; vline(ctx, x, top + 2, bottom);
        if (span / 4 >= 30 || i === 0 || i === 4) {
          ctx.fillStyle = T['text-2'];
          ctx.fillText(i === 0 ? '2.000' : '+' + c + (i === 4 ? '¢' : ''), x, g.axisY + g.axisH / 2);
        }
      }

      var xs = X(clamp(s, 0, scale));
      o.rows.forEach(function (row, j) {
        var gr = g.rows[j], my = Math.round(gr.y + gr.h / 2) + 0.5, off = !row.eligible;
        var pure = !off && Math.abs(row.mismatch) < 0.02;
        var win = row.beat > 100 ? 0.02 : row.beat > 10 ? 0.2 : 2;       /* seconds shown in the envelope strip */
        var now = env.reduceMotion ? 0 : animT * (win / 2);             /* short windows scroll in slow motion */
        var a = 1, b = 0.7;                                             /* two partials of unequal strength */
        function envAt(t) { return Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(2 * Math.PI * row.beat * t)) / (a + b); }

        ctx.globalAlpha = 1; ctx.strokeStyle = T.hairline; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(g.tx0 - 10, my); ctx.lineTo(g.tx1 + 10, my); ctx.stroke();

        var inRange = row.d <= scale * 1.0005 && row.d >= 0, xd = X(row.d);
        if (!off && inRange) {
          /* the gap the beat comes from */
          ctx.globalAlpha = 0.5; ctx.strokeStyle = T['text-2']; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(xs, my); ctx.lineTo(xd, my); ctx.stroke();
        }
        if (inRange) {
          var glow = off ? 0 : (row.beat <= 3 && !env.reduceMotion ? envAt(animT) : 0.7);
          var col = off ? T['text-2'] : pure ? T['in-tune'] : T.reference;
          if (!off) { ctx.globalAlpha = 0.08 + 0.24 * glow; ctx.fillStyle = col; rr(ctx, xd - 5.5, my - 12, 11, 24, 5.5); ctx.fill(); }
          ctx.globalAlpha = off ? 0.45 : 1; ctx.fillStyle = col; rr(ctx, xd - 1.75, my - 9, 3.5, 18, 1.75); ctx.fill();
          if (!off && span >= 190) {
            ctx.font = uiFont(10.5, 700); ctx.textBaseline = 'alphabetic';
            var label = fmtCents(row.d), lw = ctx.measureText(label).width;
            ctx.textAlign = xd + 6 + lw > g.tx1 + 10 ? 'right' : 'left';
            ctx.fillText(label, ctx.textAlign === 'left' ? xd + 6 : xd - 6, my - 8);
          }
        } else if (!off) {
          ctx.globalAlpha = 0.9; ctx.fillStyle = T.reference; ctx.beginPath();
          ctx.moveTo(g.tx1 + 9, my); ctx.lineTo(g.tx1 + 2, my - 5); ctx.lineTo(g.tx1 + 2, my + 5); ctx.closePath(); ctx.fill();
        }

        /* beat envelope strip */
        var sx = g.sx, sw = g.sw, shh = Math.min(28, gr.h - 14), sy = my - shh / 2;
        ctx.globalAlpha = 1; ctx.fillStyle = T['surface-2']; rr(ctx, sx, sy, sw, shh, 5); ctx.fill();
        if (!off) {
          ctx.save(); rr(ctx, sx, sy, sw, shh, 5); ctx.clip();
          ctx.globalAlpha = pure ? 0.75 : 0.7; ctx.fillStyle = pure ? T['in-tune'] : T.reference;
          ctx.beginPath();
          var half = shh / 2 - 3, px;
          for (px = 0; px <= sw; px += 1) { var v = envAt(now + (px / sw) * win); if (px === 0) ctx.moveTo(sx, my - half * v); else ctx.lineTo(sx + px, my - half * v); }
          for (px = sw; px >= 0; px -= 1) { var v2 = envAt(now + (px / sw) * win); ctx.lineTo(sx + px, my + half * v2); }
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1; ctx.fillStyle = T['text-2']; ctx.font = uiFont(9.5, 600); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(off ? '' : (win === 2 ? '2 s' : win === 0.2 ? '0.2 s, slowed' : '0.02 s, slowed'), sx + sw, sy + shh + 10);
      });

      /* the upper note: one line through every row, moved by the slider below */
      ctx.globalAlpha = 0.9; ctx.strokeStyle = T.accent; ctx.lineWidth = 1.5;
      vline(ctx, Math.round(xs) + 0.5 - 0.25, top, bottom + 2);
      ctx.fillStyle = T.accent; ctx.globalAlpha = 1;
      o.rows.forEach(function (row, j) {
        var gr = g.rows[j], my = Math.round(gr.y + gr.h / 2) + 0.5;
        if (!row.eligible) return;
        ctx.beginPath(); ctx.arc(xs, my, 3.5, 0, 6.2832); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    function draw() { if (!G || destroyed) return; drawLadder(); drawOctave(); }

    /* ---------------- Lifecycle ---------------- */
    var ro = null;
    function onResize() { measure(); draw(); }
    if ('ResizeObserver' in window) { ro = new ResizeObserver(onResize); ro.observe(ladWrap); ro.observe(octWrap); }
    else window.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!destroyed) onResize(); });

    env.onReduceMotionChange(function () { if (destroyed) return; bPause.hidden = !!env.reduceMotion; if (looping()) start(); else stop(); draw(); });

    bRange.value = log10(state.B).toFixed(2);
    rescale(); disp.lScale = target.lScale; disp.sScale = target.sScale; tweens = {};
    syncText(); applyAria(); measure(); draw();

    return {
      setActive: function (on) {
        active = !!on;
        if (looping()) start();
        else { stop(); if (ariaTimer) { clearTimeout(ariaTimer); applyAria(); } draw(); }
      },
      destroy: function () {
        destroyed = true; active = false;
        if (rafId) cancelAnimationFrame(rafId); rafId = 0;
        if (ariaTimer) clearTimeout(ariaTimer);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', onResize);
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      },
      /* dev harness hooks */
      seek: function (t) { animT = Math.max(0, +t || 0); settle(); draw(); },
      setState: function (o) {
        if (!o) return;
        if (o.note != null) { var i = typeof o.note === 'number' ? o.note : NOTES.map(function (x) { return x.name; }).indexOf(o.note); if (i >= 0) setNote(i); }
        if (o.B != null) setB(+o.B, false);
        if (o.stretch != null) setStretch(+o.stretch, false);
        settle(); syncText(); applyAria(); draw();
      }
    };
  }

  window.ResonanceComponents = window.ResonanceComponents || {};
  window.ResonanceComponents.partials = mount;
})();
