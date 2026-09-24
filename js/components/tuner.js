/* tuner.js — a live recreation of the app's Tune view in its two modes.
   Simple (the app's default): readout, needle and the guide card — one note, one step, plain words, moving on by ear.
   Advanced (the switch, off by default): adds the action row, partial / B chips, strobe, spectrum and details.
   Everything is driven by SIMULATED strings (no audio in, no sound out): illustrative values only.
   Geometry and strings follow App/Views/Tune/* (TuneView, ReadoutView, TuneGuideCard), MuteDiagramView and KeyboardView. */
(function () {
  'use strict';

  var registry = window.ResonanceComponents = window.ResonanceComponents || {};
  var NS = 'http://www.w3.org/2000/svg';

  /* ---------- Constants from the app ---------- */
  var HOP = 2048 / 48000;                 // FrameSpec: hop = N/8 = 2048 samples at 48 kHz = 42.7 ms
  var ALPHA = 1 - Math.exp(-HOP / 0.1);   // PartialTracker: display smoothing tau = 100 ms (about 0.347 per frame)
  var T_NEEDLE = 0.1, T_SCALE = 0.25, T_STATE = 0.2;   // Theme.Motion
  var IN_TUNE_C = 0.5, IN_TUNE_S = 0.5;   // TrackerRules.inTuneCents / inTuneSeconds
  var ZOOM_IN_C = 4, ZOOM_IN_S = 1.0, ZOOM_OUT_C = 12, ZOOM_OUT_S = 0.3, R_WIDE = 50, R_ZOOM = 10;   // NeedleView:20-25
  var STROBE_C = 15;                      // StrobeView.activeCents
  var CLEAN_HZ = 0.3;                     // UnisonAnalyzer: "clean" is a beat under 0.3 Hz
  var BOUNDARIES = [9, 16, 21];           // PianoLayout default grand: first 2-string, 3-string, plain-steel keys
  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var MINUS = '−';

  /* Demo pacing (quicker or slower than life so each line can be read): the app records the moment the needle has
     held green and calls a unison clean after 3 s under 0.3 Hz. */
  var RECORD_HOLD = 1.2, DWELL_RECORDED = 1.7, BEAT_LATENCY = 0.6, CLEAN_HOLD = 1.2, DWELL_CLEAN = 1.9;

  /* ---------- Key helpers (TunerCore Model/Key.swift) ---------- */
  function pcOf(k) { return (k + 20) % 12; }
  function octOf(k) { return Math.floor((k + 20) / 12) - 1; }
  function isBlack(k) { var p = pcOf(k); return p === 1 || p === 3 || p === 6 || p === 8 || p === 10; }
  function nameOf(k) { return NAMES[pcOf(k)] + octOf(k); }
  function hintOf(k) {
    var pc = NAMES[pcOf(k)];
    if (k === 40) return 'middle C';
    if (k <= 12) return 'the lowest ' + pc + ' on the piano';
    if (k >= 77) return 'the highest ' + pc + ' on the piano';
    if (k >= 28 && k <= 39) return 'the ' + pc + ' below middle C';
    if (k >= 41 && k <= 51) return 'the ' + pc + ' above middle C';
    var d = octOf(k) - 4, a = Math.abs(d);
    var count = a === 1 ? 'an octave' : a === 2 ? 'two octaves' : a === 3 ? 'three octaves' : 'four octaves';
    return 'the ' + pc + ' ' + count + ' ' + (d > 0 ? 'above' : 'below') + ' middle C';
  }
  var WHITE_INDEX = [], WHITE_COUNT = 0;
  (function () { for (var k = 1; k <= 88; k++) { WHITE_INDEX[k] = WHITE_COUNT; if (!isBlack(k)) WHITE_COUNT++; } })();   // 52 white keys
  function stringsOf(k) { return k < BOUNDARIES[0] ? 1 : k < BOUNDARIES[1] ? 2 : 3; }   // default grand: keys 1–8, 9–15, 16+

  /* AnalysisSettings: default tracked partial n*(k) and nMax(k). */
  function nStar(k) { return k <= 15 ? 6 : k <= 39 ? 4 : k <= 63 ? 2 : 1; }
  function nMax(k) { return k <= 27 ? 12 : k <= 51 ? 10 : k <= 63 ? 8 : k <= 75 ? 5 : 3; }
  /* InharmonicityModel default prior: log10 B = -3.4 + 0.02 d + 0.00035 d^2, d = k - 40. */
  function priorB(k) { var d = k - 40; return Math.pow(10, -3.4 + 0.02 * d + 0.00035 * d * d); }
  /* Illustrative stretch (cents) so targets away from A4 are not bare equal temperament. Not the app's solved curve. */
  function stretch(k) { var d = k - 49; return d >= 0 ? 0.012 * d * d : -0.004 * d * d; }
  function targetF1(k) { return 440 * Math.pow(2, (k - 49) / 12 + stretch(k) / 1200); }
  function ratio(n, B) { return Math.sqrt((1 + B * n * n) / (1 + B)); }        // Inharmonicity.swift: p_n = n f1 sqrt((1+Bn^2)/(1+B))
  function partialHz(k, n) { return n * targetF1(k) * ratio(n, priorB(k)); }

  /* ---------- Guide strings — verbatim from TuneGuideCard.swift and MuteInstruction.swift ---------- */
  var HEADLINE = { 3: 'Mute the left string and the right string. Keep the middle string open.', 2: 'Mute the left string. Keep the right string open.' };
  var LEFT_DEF = 'LEFT = towards the bass, as you sit at the keyboard.';
  var WATCH = 'Watch the needle. Left of the middle = too low, turn the pin up. Right = too high.';
  function stepsOf(n) { return n >= 3 ? ['mute', 'tune', 'LEFT', 'RIGHT'] : n === 2 ? ['mute', 'tune', 'LEFT'] : ['tune']; }
  function openName(n) { return n >= 3 ? 'middle' : n === 2 ? 'right' : 'only'; }
  function guideTitle(step, n) {
    if (step === 'mute') return 'Put the mutes in';
    if (step === 'tune') return n === 1 ? 'Tune the string' : 'Tune the ' + openName(n) + ' string';
    return n === 2 ? 'Match the other string' : 'Match the ' + step.toLowerCase() + ' string';
  }
  function guideBody(step, n, name) {
    if (step === 'mute') return HEADLINE[n] + ' Then play ' + name + '.';
    if (step === 'tune') return 'Play ' + name + ' and let it ring. Turn the pin of the ' + (n === 1 ? '' : openName(n) + ' ') + 'string a tiny bit at a time until the needle sits in the middle and turns green. It records by itself.';
    return (n === 2 ? 'Take out the mute.' : 'Take out the ' + step + ' mute only.') + ' Play ' + name + '. You will hear a slow wobble. Turn the ' + step + ' pin until the wobble is gone. Do not touch the ' + openName(n) + ' string\'s pin.';
  }

  /* ---------- Formatting (Theme.swift:134-195) ---------- */
  function signed(v, d) {
    var s = Math.abs(v).toFixed(d);
    if (parseFloat(s) === 0) return s;
    return (v < 0 ? MINUS : '+') + s;
  }
  function sci(b) {
    var e = Math.floor(Math.log10(b)), m = b / Math.pow(10, e);
    if (parseFloat(m.toFixed(1)) >= 10) { m /= 10; e += 1; }
    return m.toFixed(1) + 'e' + e;          // ASCII hyphen, as LogLine.sci prints it
  }
  function dbfs(v) { return (v < 0 ? MINUS : '') + Math.abs(Math.round(v)) + ' dBFS'; }

  /* ---------- Small maths ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); }
  function easeInOut(u) { u = clamp(u, 0, 1); return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u); }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash2(i, j) { var x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); }

  /* ---------- Autoplay script ----------
     One three-string note, one two-string note, one single string. Times are seconds from the start of each GUIDE STEP;
     the steps themselves end by ear, as in the app. err = the open string's offset (¢); L / R = how far the left / right
     string sits from the open one (¢). 'pull' turns the pin of whichever string the step is about. */
  var DEMO = [
    { key: 49, err: -18, L: 3.54, R: -2.75, ev: {
      mute: [[3.6, 'strike']],
      tune: [[0.9, 'pull', -9, 1.4], [2.9, 'strike'], [3.3, 'pull', -3.2, 1.2], [5.6, 'strike'], [6.0, 'pull', 1.4, 0.9], [7.6, 'strike'], [8.0, 'pull', 0.2, 0.8]],
      LEFT: [[2.6, 'strike'], [5.4, 'pull', 1.77, 1.3], [7.3, 'strike'], [7.9, 'pull', 0.8, 1.1], [10.0, 'pull', 0.1, 1.0]],
      RIGHT: [[2.4, 'strike'], [5.0, 'pull', -1.2, 1.2], [6.8, 'strike'], [7.7, 'pull', -0.1, 1.0]] } },
    { key: 13, err: 7, L: -6, R: 0, ev: {
      mute: [[3.4, 'strike']],
      tune: [[1.0, 'pull', 2.4, 1.4], [3.2, 'strike'], [3.6, 'pull', -0.7, 1.1], [5.8, 'pull', 0.1, 0.8]],
      LEFT: [[2.6, 'strike'], [5.2, 'pull', -2.6, 1.4], [7.2, 'strike'], [7.9, 'pull', 0, 1.1]] } },
    { key: 4, err: -11, L: 0, R: 0, ev: {
      tune: [[2.8, 'strike'], [3.8, 'pull', -4.5, 1.4], [5.8, 'strike'], [6.2, 'pull', -0.9, 1.1], [8.4, 'pull', 0.1, 0.8]] } }
  ];
  var MEASURED = { 4: 'wizard', 10: 'wizard', 16: 'wizard', 21: 'wizard', 28: 'wizard', 34: 'wizard', 40: 'wizard', 46: 'wizard', 49: 'auto', 61: 'wizard', 70: 'wizard', 76: 'wizard', 82: 'wizard' };
  var SUGGESTED = [55, 67];   // measurement-planner batch (numbered 1, 2) — amber pulse

  function h(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (var a in attrs) if (Object.prototype.hasOwnProperty.call(attrs, a)) n.setAttribute(a, attrs[a]);
    for (var i = 3; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return n;
  }
  function sv(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var a in attrs) if (Object.prototype.hasOwnProperty.call(attrs, a)) n.setAttribute(a, attrs[a]);
    return n;
  }
  function svg(path, vb) {
    var s = sv('svg', { viewBox: vb || '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(sv('path', { d: path }));
    return s;
  }
  function checkIcon(filled) {   // checkmark.circle / checkmark.circle.fill
    var s = sv('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false', 'class': 'rc-tuner__gcheck rc-tuner__gcheck--' + (filled ? 'fill' : 'line') });
    s.appendChild(sv('circle', filled ? { cx: 10, cy: 10, r: 8.4, fill: 'currentColor' } : { cx: 10, cy: 10, r: 7.6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }));
    s.appendChild(sv('path', { d: 'M6.4 10.3l2.5 2.5 4.8-5.3', fill: 'none', stroke: filled ? 'var(--surface)' : 'currentColor', 'stroke-width': filled ? 1.9 : 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return s;
  }
  function roundRect(ctx, x, y, w, hh, r) {
    r = Math.max(0, Math.min(r, w / 2, hh / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ---------- Mute diagram (MuteDiagramView.swift; Theme+Measure.swift) — the look of js/components/wizard.js ----------
     Strings 8 × 80, this note's strings 64 apart, neighbours 24 apart and faint, 40 between notes, wedges 20 × 28 tip down
     in the gaps BETWEEN notes, plate bar + split mute where a gap does not exist (A0, C8, and both sides of the bass break). */
  var DG = { W: 336, H: 160, pad: 16, sw: 8, sh: 80, top: 28, nSpace: 24, ownSpace: 64, gap: 40, midY: 68, plate: 30 };
  function sectionEnd(k) {
    if (k === 1) return 'below';
    if (k === 88) return 'above';
    if (stringsOf(k) > 1 && k === BOUNDARIES[2]) return 'below';
    if (stringsOf(k) > 1 && k === BOUNDARIES[2] - 1) return 'above';
    return '';
  }
  function buildDiagram(el, k) {
    while (el.firstChild) el.removeChild(el.firstChild);
    var n = stringsOf(k), end = sectionEnd(k), hasBelow = k > 1 && end !== 'below', hasAbove = k < 88 && end !== 'above';
    function xs(first, count, space) { var a = []; for (var i = 0; i < count; i++) a.push(first + i * space); return a; }
    var x = DG.pad + (hasBelow ? 0 : DG.plate), below = [], above = [], own;
    if (hasBelow) { below = xs(x, stringsOf(k - 1), DG.nSpace); x = below[below.length - 1] + DG.gap; }
    own = xs(x, n, DG.ownSpace); x = own[own.length - 1];
    if (hasAbove) { above = xs(x + DG.gap, stringsOf(k + 1), DG.nSpace); x = above[above.length - 1]; } else x += DG.plate;
    /* The app sizes the canvas to its content; here the content is centred in a constant 336-wide viewBox so the scale
       does not change between notes. */
    var dx = Math.round((DG.W - (x + DG.pad)) / 2), bottom = DG.top + DG.sh, g = sv('g');
    function shift(a) { return a.map(function (v) { return v + dx; }); }
    below = shift(below); own = shift(own); above = shift(above);
    function strings(list, cls) { list.forEach(function (sx) { g.appendChild(sv('rect', { x: sx - DG.sw / 2, y: DG.top, width: DG.sw, height: DG.sh, rx: DG.sw / 2, 'class': cls })); }); }
    function caption(cx, cy, text, cls, anchor) { var t = sv('text', { x: cx, y: cy + 4, 'text-anchor': anchor || 'middle', 'class': 'rc-tuner__dcap' + (cls ? ' ' + cls : '') }); t.textContent = text; g.appendChild(t); }
    strings(below, 'rc-tuner__dstr rc-tuner__dstr--nb'); strings(above, 'rc-tuner__dstr rc-tuner__dstr--nb');
    if (below.length) caption((below[0] + below[below.length - 1]) / 2, bottom + 12, nameOf(k - 1), 'rc-tuner__dcap--nb');
    if (above.length) caption((above[0] + above[above.length - 1]) / 2, bottom + 12, nameOf(k + 1), 'rc-tuner__dcap--nb');
    var open = n === 1 ? 0 : 1, labels = n === 3 ? ['LEFT', 'MIDDLE', 'RIGHT'] : n === 2 ? ['LEFT', 'RIGHT'] : ['SINGLE'];   // open: MIDDLE of three, RIGHT of two
    own.forEach(function (sx, i) {
      g.appendChild(sv('rect', { x: sx - DG.sw / 2, y: DG.top, width: DG.sw, height: DG.sh, rx: DG.sw / 2, 'class': 'rc-tuner__dstr' + (i === open ? ' rc-tuner__dstr--ref' : '') }));
      caption(sx, bottom + 12, labels[i]);
    });
    caption(own[open], DG.top - 12, 'reference', 'rc-tuner__dcap--ref');
    function plateBar(px) {   /* the app captions it under the bar, on top of LEFT / RIGHT; here the caption sits above it */
      g.appendChild(sv('rect', { x: px - 3, y: DG.top - 10, width: 6, height: DG.sh + 20, rx: 2, 'class': 'rc-tuner__dplate' }));
      caption(px, DG.top - 22, 'plate bar');
    }
    if (!hasBelow) plateBar(own[0] - DG.plate + 6);
    if (!hasAbove) plateBar(own[own.length - 1] + DG.plate - 6);
    function wedge(cx) { g.appendChild(sv('polygon', { points: (cx - 10) + ',' + (DG.midY - 14) + ' ' + (cx + 10) + ',' + (DG.midY - 14) + ' ' + cx + ',' + (DG.midY + 14), 'class': 'rc-tuner__dwedge' })); }
    function splitMute(sx, inward) {   /* caption moved off the string (the app draws it across it), on two lines to clear the next string */
      g.appendChild(sv('rect', { x: sx - 7, y: DG.midY - 11, width: 14, height: 22, rx: 3, 'class': 'rc-tuner__dsplit' }));
      caption(sx + inward * 13, DG.midY - 7, 'split', 'rc-tuner__dcap--warn', inward > 0 ? 'start' : 'end');
      caption(sx + inward * 13, DG.midY + 7, 'mute', 'rc-tuner__dcap--warn', inward > 0 ? 'start' : 'end');
    }
    if (n >= 2) { if (hasBelow) wedge(own[0] - DG.gap / 2); else splitMute(own[0], 1); }                       // wedgeGaps: [.belowNote] …
    if (n >= 3) { if (hasAbove) wedge(own[2] + DG.gap / 2); else splitMute(own[2], -1); }                      // … and [.aboveNote] for three strings
    var foot = sv('text', { x: DG.W / 2, y: DG.H - 6, 'text-anchor': 'middle', 'class': 'rc-tuner__dfoot' });
    foot.textContent = 'as seen from the bench, bass to the left';
    g.appendChild(foot); el.appendChild(g);
    el.setAttribute('aria-label', 'Mute diagram for ' + nameOf(k) + ', as seen from the bench with the bass to the left. ' +
      (n === 3 ? 'Three strings. Yellow mutes on the left string and the right string; the middle string, in amber, stays open.' : 'Two strings. A yellow mute on the left string; the right string, in amber, stays open.'));
  }

  registry.tuner = function mount(el, env) {
    var T = env.tokens, F = env.fonts;
    var fb = el.querySelector('.rc-fallback'); if (fb) fb.remove();

    /* ================= DOM ================= */
    /* The "Advanced mode" switch of Settings › Tuning behaviour. Off = the app's default. Not stored. */
    var switchBtn = h('button', 'rc-tuner__switch', { type: 'button', role: 'switch', 'aria-checked': 'false', title: 'Off: the step-by-step guide only, as the app starts. On: also the strobe, the spectrum and the numbers.' },
      h('span', 'rc-tuner__switchtext', null, 'Advanced mode'), h('span', 'rc-tuner__switchtrack', { 'aria-hidden': 'true' }, h('i')));

    var pcEl = h('span', 'rc-tuner__pc'), octEl = h('span', 'rc-tuner__oct');
    var noteEl = h('div', 'rc-tuner__note', { role: 'img' }, pcEl, octEl);
    var hintEl = h('p', 'rc-tuner__hint', { 'aria-hidden': 'true' });
    var centsEl = h('span', 'rc-tuner__cents'), wordEl = h('span', 'rc-tuner__word');
    var row2 = h('div', 'rc-tuner__row2', { 'aria-live': 'off' }, centsEl, wordEl);
    var arrowEl = h('span', 'rc-tuner__arrow', { 'aria-hidden': 'true' }), phraseEl = h('span', 'rc-tuner__phrase'), capEl = h('span', 'rc-tuner__rowcap');
    var row3 = h('div', 'rc-tuner__row3', { 'aria-live': 'off' }, arrowEl, phraseEl, capEl);
    var partialTxt = h('span');
    var partialChip = h('span', 'rc-tuner__badge rc-tuner__badge--accent', null, svg('M2 6v4M5 3.5v9M8 1.5v13M11 4v8M14 6.5v3'), partialTxt);
    var dots = h('span', 'rc-tuner__dots', { role: 'img' }, h('i'), h('i'), h('i'), h('i'));
    var bChip = h('span', 'rc-tuner__badge');
    var chips = h('div', 'rc-tuner__chips', null, partialChip, dots, bChip);
    var readout = h('div', 'rc-tuner__readout', null, h('div', 'rc-tuner__row1', null, noteEl, hintEl), row2, row3, chips);

    var markBtn = h('button', 'rc-tuner__btn rc-tuner__btn--prominent', { type: 'button', title: 'M — only when the last reading was confident' }, svg('M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM5 8.2l2.1 2.1L11 6.2'), 'Mark tuned');
    var prevBtn = h('button', 'rc-tuner__btn rc-tuner__btn--icon', { type: 'button', 'aria-label': 'Previous note', title: '← previous note' }, svg('M13 8H3.5M7.5 3.5L3 8l4.5 4.5'));
    var nextBtn = h('button', 'rc-tuner__btn rc-tuner__btn--icon', { type: 'button', 'aria-label': 'Next note', title: '→ next note' }, svg('M3 8h9.5M8.5 3.5L13 8l-4.5 4.5'));
    var countEl = h('span', 'rc-tuner__count');
    var actions = h('div', 'rc-tuner__actions', null, markBtn, prevBtn, nextBtn, countEl);

    var needleCv = h('canvas', null, { role: 'img', 'aria-label': 'Needle' });
    var strobeCv = h('canvas', null, { role: 'img', 'aria-label': 'Strobe' });
    var needleBox = h('div', 'rc-tuner__needle', null, needleCv), strobeBox = h('div', 'rc-tuner__strobe', null, strobeCv);
    var colA = h('div', 'rc-tuner__left', null, readout, actions, needleBox, strobeBox);

    /* The guide card (TuneGuideCard): header, one panel per step (stacked, so the card keeps one height), text buttons. */
    var gName = h('span', 'rc-tuner__gname'), gStep = h('span', 'rc-tuner__gstep'), gCaps = h('span', 'rc-tuner__gcaps', { 'aria-hidden': 'true' }), gCount = h('span', 'rc-tuner__gcount');
    var gStack = h('div', 'rc-tuner__gstack', { 'aria-live': 'off' });
    var gNext = h('button', 'rc-tuner__textbtn', { type: 'button', title: 'Only if it does not move on by itself' }, 'Next step');
    var gPrev = h('button', 'rc-tuner__textbtn', { type: 'button' }, 'Previous note');
    var gSkip = h('button', 'rc-tuner__textbtn', { type: 'button' }, 'Skip note');
    var guide = h('section', 'rc-tuner__card rc-tuner__guide', { 'aria-label': 'Guide: one step at a time' },
      h('div', 'rc-tuner__ghead', null, gName, gStep, gCaps, gCount), gStack, h('div', 'rc-tuner__gbtns', null, gNext, gPrev, gSkip));

    var strikeBtn = h('button', 'rc-tuner__btn rc-tuner__btn--strike', { type: 'button' }, svg('M3 2.5h10v4.2H9.6L8.9 13H7.1l-.7-6.3H3z'), 'Strike');
    var pinId = 'rc-tuner-pin-' + Math.random().toString(36).slice(2, 8);
    var pin = h('input', 'rc-tuner__range', { type: 'range', id: pinId, min: '-30', max: '30', step: '0.1', value: '0' });
    var pinLabel = h('label', 'rc-tuner__pinlabel', { 'for': pinId }, 'Turn the pin');
    var pinBlock = h('div', 'rc-tuner__pin', null, pinLabel,
      h('div', 'rc-tuner__rail', null, pin),
      h('div', 'rc-tuner__scale', { 'aria-hidden': 'true' }, h('span', null, null, MINUS + '30¢ flat'), h('span', null, null, '0'), h('span', null, null, 'sharp +30¢')));
    var resumeBtn = h('button', 'rc-tuner__btn rc-tuner__btn--ghost', { type: 'button', hidden: '' }, svg('M4.5 2.8v10.4L13 8z'), 'Resume demo');
    var controls = h('div', 'rc-tuner__controls', null, strikeBtn, pinBlock, resumeBtn);

    var specCap = h('span', 'rc-tuner__cardcap');
    var specCv = h('canvas', null, { role: 'img', 'aria-label': 'Spectrum' });
    var specCard = h('section', 'rc-tuner__card rc-tuner__card--spectrum', null,
      h('div', 'rc-tuner__cardhead', null, h('h3', 'rc-tuner__cardtitle', null, 'Spectrum'), specCap), h('div', 'rc-tuner__specbox', null, specCv));
    var DETAIL_KEYS = ['f_meas', 'f1_equiv', 'target f1', 'target p_n*', 'n*', 'B_k', 'cents raw', 'state'];
    var detailEls = {}, dl = h('dl', 'rc-tuner__details', { 'aria-live': 'off' });
    DETAIL_KEYS.forEach(function (k) { var dd = h('dd'); detailEls[k] = dd; dl.appendChild(h('div', null, null, h('dt', null, null, k), dd)); });
    var detCard = h('section', 'rc-tuner__card rc-tuner__card--details', null,
      h('div', 'rc-tuner__cardhead', null, h('h3', 'rc-tuner__cardtitle', null, 'Details'), h('span', 'rc-tuner__cardcap', null, 'simulated string')), dl);
    var extras = h('div', 'rc-tuner__extras', null, specCard, detCard);
    var colB = h('div', 'rc-tuner__right', null, guide, controls, extras);

    var meterCv = h('canvas', null, { role: 'img', 'aria-label': 'Input level' });
    var dbEl = h('span', 'rc-tuner__db', { 'aria-hidden': 'true' });
    var levelRow = h('div', 'rc-tuner__level', null,
      svg('M8 1.5a2 2 0 0 0-2 2v4a2 2 0 0 0 4 0v-4a2 2 0 0 0-2-2zM3.8 7.5a4.2 4.2 0 0 0 8.4 0M8 11.7v2.8'),
      h('div', 'rc-tuner__meter', null, meterCv), dbEl, h('span', 'rc-tuner__engine', null, 'simulated · no audio in or out'));

    var kbCv = h('canvas', null, { 'aria-hidden': 'true' });
    var marker = h('i', 'rc-tuner__marker', { 'aria-hidden': 'true' });
    var tip = h('div', 'rc-tuner__tip', { 'aria-hidden': 'true', hidden: '' });
    var kb = h('div', 'rc-tuner__kbd', { role: 'slider', tabindex: '0', 'aria-label': 'Selected note (88 keys)', 'aria-valuemin': '1', 'aria-valuemax': '88', 'aria-orientation': 'horizontal' }, marker, h('div', 'rc-tuner__keys', null, kbCv), tip);
    var live = h('p', 'visually-hidden', { 'aria-live': 'polite' });

    /* data-phone: the iPhone-sized copy. The phone's Advanced mode adds only the spectrum, so no switch here. */
    if (el.hasAttribute('data-phone')) switchBtn.hidden = true;
    var root = h('div', 'rc-tuner__root', { 'data-adv': 'off' }, switchBtn, h('div', 'rc-tuner__main', null, colA, colB), levelRow, kb, live);
    var ADV = [partialChip, bChip, actions, strobeBox, extras, detCard];       // what Advanced mode adds (TuneView / ReadoutView `if advanced`)
    ADV.forEach(function (n) { n.hidden = true; });
    el.appendChild(root);

    /* ================= State ================= */
    var S = {}, V = {}, G = { steps: [], panels: [], caps: [] };   // S: simulated strings + tracker; V: what is drawn (tweened); G: the guide
    var mode = 'demo';            // 'demo' | 'user'
    var advanced = false, wide = false;
    var active = false, raf = 0, lastNow = 0, destroyed = false;
    var noise = rng(7);
    var hoverKey = 0;
    var dirty = { needle: true, strobe: true, spec: true, kb: true, meter: true };

    function freshPiano() {
      var r = rng(20260921), k;
      S.err = []; S.offL = []; S.offR = []; S.tuned = [];
      for (k = 1; k <= 88; k++) {
        S.tuned[k] = k >= 18 && k <= 48;                                // 31 notes done: D2 up to G#4
        S.err[k] = S.tuned[k] ? (r() - 0.5) * 0.5 : clamp(-6 + (r() - 0.5) * 16, -22, 12);
        S.err[k] = Math.round(S.err[k] * 10) / 10;
        S.offL[k] = Math.round((2 + r() * 4) * (r() < 0.5 ? -1 : 1) * 10) / 10;     // untouched unisons sit a few cents apart
        S.offR[k] = Math.round((2 + r() * 4) * (r() < 0.5 ? -1 : 1) * 10) / 10;
      }
      DEMO.forEach(function (d) { S.err[d.key] = d.err; S.offL[d.key] = d.L; S.offR[d.key] = d.R; S.tuned[d.key] = false; });
    }

    function selectKey(k) {
      k = clamp(k, 1, 88);
      S.key = k; S.n = nStar(k); S.B = priorB(k); S.p = partialHz(k, S.n); S.f1 = targetF1(k);
      S.rate = k <= 27 ? 3 : k <= 63 ? 5 : k <= 75 ? 8 : 11;            // dB/s: bass rings, treble dies quickly
      S.state = 'idle'; S.cents = null; S.raw = null; S.decayed = null; S.hist = [];
      S.strikeT = -1; S.peak0 = -60; S.conf = 0; S.confident = false; S.struck = false;
      S.inTuneSince = -1; S.zoomInSince = -1; S.zoomOutSince = -1;      // NeedleView: timers cleared, zoom level kept
      S.pull = null; S.silentSince = S.t;
      dirty.kb = dirty.spec = true;
      beginGuide();
      syncPin();
    }

    function resetAll(static_) {
      S.t = 0; S.acc = 0; S.frame = 0; S.zoomed = false; S.level = -52; S.hold = -52; S.holdT = 0; S.markFlash = -1; S.advanceAt = -1;
      S.demoIdx = 0; S.demoNote = 0; S.demoT = 0;
      noise = rng(7);
      freshPiano();
      selectKey(DEMO[0].key);
      var again = !static_ && V.range != null;        // loop restart: glide back instead of snapping
      V.nFrom = again ? V.needle : 0; V.needle = V.nFrom; V.nTo = 0; V.nT0 = again ? 0 : -1;
      V.rFrom = again ? V.range : R_WIDE; V.range = V.rFrom; V.rTo = R_WIDE; V.rT0 = again ? 0 : -1;
      if (!again) { V.glow = 0; V.dim = 0; V.mix = 0; V.phase = 0; }
      V.pulse = 1; V.wob = 0;
      if (static_) {                       // Reduce Motion: one meaningful still — A4, step 2, closing in on the zoomed scale
        G.idx = 1; S.err[S.key] = -2.3; S.struck = true; syncPin(); settle();
      }
      updateDom(true);
      dirty.needle = dirty.strobe = dirty.spec = dirty.kb = dirty.meter = true;
    }

    /* ================= The guide (TuneGuideCard.swift) ================= */
    function stepNow() { return G.steps[G.idx]; }
    function isMatch(step) { return step === 'LEFT' || step === 'RIGHT'; }

    function beginGuide() {            // begin(): step 1, nothing recorded, no wobble heard yet
      G.steps = stepsOf(stringsOf(S.key)); G.idx = 0; G.recorded = false;
      clearMatch();
      buildGuide();
    }
    function clearMatch() { G.heard = false; G.clean = false; G.unmuted = false; G.beat = null; G.dir = 0; G.quietSince = -1; G.advanceAt = -1; G.phase = 0; S.demoIdx = 0; S.demoT = 0; }

    function buildPanel(step, n, name, k, ghost) {
      /* Every panel starts with its resting status line, so the stack has its full height from the first frame. */
      var text = h('span', null, null, step === 'mute' ? 'Waiting for you to play ' + name + '…' : step === 'tune' ? WATCH : 'Play the note to hear the wobble.');
      var wob = h('i', 'rc-tuner__wob', { 'aria-hidden': 'true' });
      var status = h('p', 'rc-tuner__gstatus', { 'data-kind': 'quiet', 'data-icon': 'none' }, h('span', 'rc-tuner__gicon', { 'aria-hidden': 'true' }, wob, checkIcon(false), checkIcon(true)), text);
      var diagram = null;
      if (step === 'mute') {
        var dsvg = sv('svg', { viewBox: '0 0 ' + DG.W + ' ' + DG.H, role: 'img', focusable: 'false' });
        if (!ghost) buildDiagram(dsvg, k);
        diagram = h('div', 'rc-tuner__diagram', { title: LEFT_DEF }, dsvg);
      }
      var panel = h('div', 'rc-tuner__gpanel' + (ghost ? ' rc-tuner__gpanel--ghost' : ''), { 'aria-hidden': 'true' },
        h('h3', 'rc-tuner__gtitle', null, guideTitle(step, n)), h('p', 'rc-tuner__gbody', null, guideBody(step, n, name)), diagram, status);
      return { el: panel, status: status, text: text, wob: wob };
    }
    function buildGuide() {
      var k = S.key, n = stringsOf(k), name = nameOf(k);
      gStack.textContent = ''; gCaps.textContent = ''; G.panels = []; G.caps = [];
      G.steps.forEach(function (step) {
        var p = buildPanel(step, n, name, k, false);
        gStack.appendChild(p.el); G.panels.push(p); G.caps.push(gCaps.appendChild(h('i')));
      });
      /* An invisible three-string mute step sizes the stack, so the card (and the page under it) keeps one height on every note. */
      if (n < 3) gStack.appendChild(buildPanel('mute', 3, name, k, true).el);
      delete cache.gpanel; delete cache.gstatus; lastWob = '';
    }

    function beatHz() { var off = stepNow() === 'RIGHT' ? S.offR[S.key] : S.offL[S.key]; return Math.abs(S.p * (Math.pow(2, off / 1200) - 1)); }   // beat at the tracked partial
    function record() {                // markTuned(advance: false); recorded = true
      S.tuned[S.key] = true; G.recorded = true; dirty.kb = true;
      if (mode === 'user') say(nameOf(S.key) + ' recorded');
    }
    function advanceGuide() {          // advance()
      if (stepNow() === 'tune' && !G.recorded) { if (S.conf >= 3 && S.cents != null) { S.tuned[S.key] = true; dirty.kb = true; } G.recorded = true; }   // records when the reading is steady; otherwise just moves on
      if (G.idx >= G.steps.length - 1) { nextNote(); return; }
      G.idx++; clearMatch(); S.pull = null;
      syncPin();
      if (mode === 'user') say('Step ' + (G.idx + 1) + ' of ' + G.steps.length + ': ' + guideTitle(stepNow(), stringsOf(S.key)));
      updateDom(true);
    }
    function nextNote() {
      if (mode === 'demo') {
        S.demoNote++;
        if (S.demoNote >= DEMO.length) { resetAll(false); return; }
        selectKey(DEMO[S.demoNote].key);
      } else if (S.key < 88) { selectKey(S.key + 1); say('Next note: ' + nameOf(S.key)); }
      else { G.advanceAt = -1; return; }
      updateDom(true);
    }

    /* By ear, once per tracker frame: the tuning step ends when the needle holds green, a matching step when the wobble
       was heard and then went away ("heard, then gone" — a still-muted string has no wobble either). */
    function guideFrame() {
      var step = stepNow();
      if (step === 'tune') {
        if (!G.recorded && S.state === 'inTune' && S.t - S.inTuneSince >= IN_TUNE_S + RECORD_HOLD) { record(); G.advanceAt = S.t + DWELL_RECORDED; }
      } else if (isMatch(step)) {
        var ringing = G.unmuted && S.sig > -44;                       // a fresh strike does not interrupt the reading
        if (ringing && (G.beat != null || G.quietSince >= 0 || S.t - S.strikeT >= BEAT_LATENCY)) {
          var b = beatHz();
          if (b >= CLEAN_HZ) { G.heard = true; G.beat = b; G.dir = (step === 'RIGHT' ? S.offR[S.key] : S.offL[S.key]) > 0 ? 1 : -1; G.quietSince = -1; G.clean = false; G.advanceAt = -1; }
          else {
            G.beat = null; if (G.quietSince < 0) G.quietSince = S.t;
            if (!G.clean && S.t - G.quietSince >= CLEAN_HOLD) { G.clean = true; if (G.heard) { G.advanceAt = S.t + DWELL_CLEAN; if (mode === 'user') say('No wobble — this string matches'); } }
          }
        } else if (!ringing && !G.clean) { G.beat = null; G.quietSince = -1; }
      }
      if (G.advanceAt >= 0 && S.t >= G.advanceAt) { G.advanceAt = -1; advanceGuide(); }
    }
    /* The same without a clock (Reduce Motion): it never moves on by itself — "Next step" does. */
    function guideSettle() {
      var step = stepNow();
      if (step === 'tune') { if (!G.recorded && S.struck && Math.abs(S.err[S.key]) < IN_TUNE_C) record(); }
      else if (isMatch(step) && G.unmuted) {
        var b = beatHz();
        if (b >= CLEAN_HZ) { G.heard = true; G.beat = b; G.dir = pinGet() > 0 ? 1 : -1; G.clean = false; } else { G.beat = null; G.clean = true; }
      }
    }
    function guideStatus() {
      var step = stepNow(), name = nameOf(S.key);
      if (step === 'mute') return ['quiet', 'none', 'Waiting for you to play ' + name + '…'];
      if (step === 'tune') {
        if (G.recorded) return ['good', 'fill', 'Recorded'];
        if (S.state === 'inTune') return ['good', 'line', 'In tune — hold it there'];       // live.isInTune: held green for half a second
        return ['quiet', 'none', WATCH];
      }
      if (G.clean) return ['good', 'fill', 'No wobble — this string matches'];
      if (G.beat != null) return ['warn', 'wob', (G.dir > 0 ? 'Turn it down a little' : 'Turn it up a little') + ' · wobble ' + G.beat.toFixed(1) + ' per second'];
      return ['quiet', 'none', G.heard ? 'Keep going until the wobble is gone.' : 'Play the note to hear the wobble.'];
    }

    /* The pin the visitor (or the script) is turning: the open string while tuning, the LEFT / RIGHT string while matching. */
    function pinGet() { var s = stepNow(); return s === 'LEFT' ? S.offL[S.key] : s === 'RIGHT' ? S.offR[S.key] : S.err[S.key]; }
    function pinSet(v) { var s = stepNow(); if (s === 'LEFT') S.offL[S.key] = v; else if (s === 'RIGHT') S.offR[S.key] = v; else S.err[S.key] = v; }

    function strike() {
      S.strikeT = S.t; S.peak0 = -9 - noise() * 1.5; S.struck = true;
      S.holdT = S.t;
      var step = stepNow();
      if (step === 'mute') advanceGuide();          // mutes are in when the note is played: the first strike starts the tuning step
      else if (isMatch(step)) G.unmuted = true;     // the mute is out: two strings sound
    }

    function markTuned() {
      if (S.conf < 3) return false;
      S.tuned[S.key] = true; S.markFlash = S.t + 0.35; S.advanceAt = mode === 'user' ? S.t + 0.9 : -1;
      if (stepNow() === 'tune') G.recorded = true;
      dirty.kb = true;
      return true;
    }

    /* ---------- One tracker frame every 42.7 ms ---------- */
    function trackerFrame() {
      S.frame++;
      var age = S.strikeT >= 0 ? S.t - S.strikeT : -1;
      var sig = age >= 0 ? S.peak0 - S.rate * age : -120;
      var ambient = -52 + (noise() - 0.5) * 2.5;
      var twoStrings = isMatch(stepNow()) && G.unmuted, env = 0.5 + 0.5 * Math.cos(2 * Math.PI * G.phase);
      S.sig = sig;
      S.level = Math.max(sig - (twoStrings && G.beat != null ? 7 * (1 - env) : 0), ambient);   // two strings beating: the level swells and fades
      if (S.level >= S.hold) { S.hold = S.level; S.holdT = S.t; } else if (S.t - S.holdT > 1) S.hold = Math.max(S.level, S.hold - 14 * HOP);
      var wasTracking = S.state === 'tracking' || S.state === 'inTune';
      S.confident = age >= 0.085 && sig > -44;       // first 80 ms after the onset are not used
      if (S.confident) {
        var jitter = (0.03 + 0.22 * clamp((-30 - sig) / 14, 0, 1)) * (noise() + noise() + noise() - 1.5) * 1.6;
        var pitch = S.err[S.key] + (twoStrings ? pinGet() * (0.45 + 0.2 * Math.sin(2 * Math.PI * G.phase)) : 0);   // two strings: the reading sits between them and wavers
        var raw = pitch + 0.5 * Math.exp(-age / 0.15) + 0.1 * Math.sin(S.t * 2.3) + jitter;   // attack runs a hair sharp
        S.raw = raw;
        S.cents = wasTracking && S.cents != null ? S.cents + ALPHA * (raw - S.cents) : raw;
        S.hist.push(S.cents); if (S.hist.length > 7) S.hist.shift();     // last 300 ms
        S.conf = sig > -38 ? 3 : 2;
        var a = Math.abs(S.cents);
        if (a < IN_TUNE_C && S.conf >= 3) { if (S.inTuneSince < 0) S.inTuneSince = S.t; } else S.inTuneSince = -1;
        var nowInTune = S.inTuneSince >= 0 && S.t - S.inTuneSince >= IN_TUNE_S;
        S.state = nowInTune ? 'inTune' : 'tracking';
        /* NeedleView zoom rule */
        if (!S.zoomed) { if (a < ZOOM_IN_C) { if (S.zoomInSince < 0) S.zoomInSince = S.t; if (S.t - S.zoomInSince >= ZOOM_IN_S) { S.zoomed = true; S.zoomInSince = -1; } } else S.zoomInSince = -1; }
        else { if (a > ZOOM_OUT_C) { if (S.zoomOutSince < 0) S.zoomOutSince = S.t; if (S.t - S.zoomOutSince >= ZOOM_OUT_S) { S.zoomed = false; S.zoomOutSince = -1; } } else S.zoomOutSince = -1; }
        S.silentSince = S.t;
      } else {
        S.zoomInSince = S.zoomOutSince = S.inTuneSince = -1;
        if (wasTracking) {
          var m = S.hist.slice().sort(function (x, y) { return x - y; });
          S.decayed = m.length ? m[m.length >> 1] : S.cents; S.state = 'decayed'; S.silentSince = S.t;
        } else if (S.state === 'decayed' && S.t - S.silentSince > 10) { S.state = 'idle'; S.cents = null; }
        S.conf = S.state === 'decayed' ? (sig > -47 ? 2 : sig > -52 ? 1 : 0) : 0;
      }
      guideFrame();
      var shown = S.state === 'idle' ? 0 : S.state === 'decayed' ? S.decayed : S.cents;
      if (shown !== V.nTo) { V.nFrom = V.needle; V.nTo = shown; V.nT0 = S.t; }
      var r = S.zoomed ? R_ZOOM : R_WIDE;
      if (r !== V.rTo) { V.rFrom = V.range; V.rTo = r; V.rT0 = S.t; }
      dirty.spec = dirty.meter = true;
      updateDom(false);
    }

    /* ---------- Simulation step (fixed or variable dt) ---------- */
    function step(dt) {
      S.t += dt;
      if (mode === 'demo') runDemo(dt);
      if (S.pull) {
        var u = (S.t - S.pull.t0) / S.pull.dur;
        pinSet(S.pull.from + (S.pull.to - S.pull.from) * easeInOut(u));
        if (u >= 1) { pinSet(S.pull.to); S.pull = null; }
        syncPin();
      }
      if (S.advanceAt >= 0 && S.t >= S.advanceAt) { S.advanceAt = -1; if (S.key < 88) { selectKey(S.key + 1); updateDom(true); } }
      /* The wobble swells and fades at exactly the rate the card prints (one decimal). */
      var shownBeat = G.beat != null ? Math.round(G.beat * 10) / 10 : 0;
      G.phase = (G.phase + shownBeat * dt) % 1;
      S.acc += dt;
      while (S.acc >= HOP) { S.acc -= HOP; trackerFrame(); }
      /* tweens */
      V.needle = V.nT0 < 0 ? V.nTo : V.nFrom + (V.nTo - V.nFrom) * easeOut((S.t - V.nT0) / T_NEEDLE);
      V.range = V.rT0 < 0 ? V.rTo : V.rFrom + (V.rTo - V.rFrom) * easeInOut((S.t - V.rT0) / T_SCALE);
      var k = dt / T_STATE;
      V.glow = approach(V.glow, S.state === 'inTune' ? 1 : 0, k);
      V.dim = approach(V.dim, S.state === 'decayed' ? 1 : 0, k);
      var on = strobeOn();
      V.mix = approach(V.mix, on ? 1 : 0, k);
      if (on) { var df = S.p * (Math.pow(2, S.cents / 1200) - 1); V.phase = (V.phase + df * dt) % 1; if (V.phase < 0) V.phase += 1; }   // in periods
      V.pulse = 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * (S.t % 1)));    // KeyboardView suggested-next pulse
      V.wob = G.beat != null ? 0.5 + 0.5 * Math.cos(2 * Math.PI * G.phase) : approach(V.wob, 0, k);
    }
    function approach(v, target, k) { return v < target ? Math.min(target, v + k) : Math.max(target, v - k); }
    function strobeOn() { return (S.state === 'tracking' || S.state === 'inTune') && S.confident && S.cents != null && Math.abs(S.cents) <= STROBE_C; }

    function runDemo(dt) {
      S.demoT += dt;
      var list = DEMO[S.demoNote].ev[stepNow()] || [], ev, note = S.demoNote, idx = G.idx;
      while ((ev = list[S.demoIdx]) && ev[0] <= S.demoT) {
        S.demoIdx++;
        if (ev[1] === 'strike') strike();
        else if (ev[1] === 'pull') S.pull = { from: pinGet(), to: ev[2], t0: S.t, dur: ev[3] };
        if (S.demoNote !== note || G.idx !== idx) return;            // the step ended (a strike ends the mute step): its script is over
      }
      /* Safety net: a step that has not ended by ear well after its last event moves on like "Next step". */
      if (!list[S.demoIdx] && G.advanceAt < 0 && S.demoT > (list.length ? list[list.length - 1][0] : 0) + 9) advanceGuide();
    }

    /* Reduce Motion / instant path: no clock, the display follows the strings at once. */
    function settle() {
      var c = S.err[S.key] + (isMatch(stepNow()) && G.unmuted ? 0.45 * pinGet() : 0);
      if (S.struck) {
        S.cents = S.raw = c; S.conf = 3; S.confident = true; S.level = S.hold = S.sig = S.peak0 = -14; S.strikeT = S.t;
        var a = Math.abs(c);
        if (a < ZOOM_IN_C) S.zoomed = true; else if (a > ZOOM_OUT_C) S.zoomed = false;
        S.state = a < IN_TUNE_C ? 'inTune' : 'tracking';
      } else { S.state = 'idle'; S.cents = null; S.conf = 0; S.confident = false; S.level = S.hold = -52; S.sig = -120; S.strikeT = -1; }
      guideSettle();
      V.needle = V.nTo = S.cents == null ? 0 : S.cents; V.nT0 = -1;
      V.range = V.rTo = S.zoomed ? R_ZOOM : R_WIDE; V.rT0 = -1;
      V.glow = S.state === 'inTune' ? 1 : 0; V.dim = 0; V.mix = strobeOn() ? 1 : 0; V.pulse = 1; V.wob = G.beat != null ? 0.6 : 0;
      dirty.needle = dirty.strobe = dirty.spec = dirty.kb = dirty.meter = true;
      updateDom(true);
    }

    /* ================= DOM sync (tracker cadence, never per animation frame) ================= */
    var cache = {}, lastWob = '';
    function setText(node, key, v) { if (cache[key] !== v) { cache[key] = v; node.textContent = v; } }
    function setAttr(node, key, name, v) { if (cache[key] !== v) { cache[key] = v; node.setAttribute(name, v); } }
    var lastAria = -10, lastAriaState = '';

    function stateColor() {
      if (S.state === 'idle' || S.cents == null) return 'idle';
      var c = S.state === 'decayed' ? S.decayed : S.cents;
      if (S.state === 'inTune' || Math.abs(c) < IN_TUNE_C) return 'intune';
      return c < 0 ? 'flat' : 'sharp';
    }

    function updateGuide(tunedCount) {
      var k = S.key, n = G.steps.length, i = G.idx;
      setText(gName, 'gname', nameOf(k));
      setText(gStep, 'gstep', 'step ' + (i + 1) + ' of ' + n);
      setText(gCount, 'gcount', tunedCount + ' of 88 notes tuned');
      var pk = k + ':' + i;
      if (cache.gpanel !== pk) {
        cache.gpanel = pk; delete cache.gstatus; lastWob = '';
        G.panels.forEach(function (p, j) { p.el.classList.toggle('is-active', j === i); p.el.setAttribute('aria-hidden', j === i ? 'false' : 'true'); });
        G.caps.forEach(function (c, j) { c.classList.toggle('is-on', j <= i); });
        var side = stepNow();
        pinLabel.textContent = isMatch(side) ? 'Turn the ' + side + ' pin' : 'Turn the pin';
      }
      var st = guideStatus(), sk = st.join('|'), p = G.panels[i];
      if (cache.gstatus !== sk && p) { cache.gstatus = sk; p.status.setAttribute('data-kind', st[0]); p.status.setAttribute('data-icon', st[1]); p.text.textContent = st[2]; }
      if (cache.gprev !== (k <= 1)) { cache.gprev = k <= 1; gPrev.disabled = k <= 1; }
      if (cache.gskip !== (k >= 88)) { cache.gskip = k >= 88; gSkip.disabled = k >= 88; }
    }

    function updateDom(force) {
      var k = S.key, name = nameOf(k);
      setText(pcEl, 'pc', NAMES[pcOf(k)]); setText(octEl, 'oct', String(octOf(k)));
      setAttr(noteEl, 'noteAria', 'aria-label', name + ' — ' + hintOf(k));
      setText(hintEl, 'hint', name + ' — ' + hintOf(k));
      var col = stateColor(), c = S.state === 'decayed' ? S.decayed : S.cents;
      setAttr(root, 'col', 'data-tone', col);
      setAttr(root, 'st', 'data-state', S.state);
      if (col === 'idle') {
        setText(centsEl, 'cents', '—'); setText(wordEl, 'word', '');
        setText(arrowEl, 'arrow', ''); setText(phraseEl, 'phrase', 'Play a note'); setText(capEl, 'cap', '');
      } else {
        setText(centsEl, 'cents', signed(c, 1));
        setText(wordEl, 'word', col === 'intune' ? 'IN TUNE' : col === 'flat' ? 'FLAT' : 'SHARP');
        setText(arrowEl, 'arrow', col === 'intune' ? '✓' : col === 'flat' ? '↑' : '↓');
        setText(phraseEl, 'phrase', col === 'intune' ? 'leave it' : col === 'flat' ? 'raise the pitch' : 'lower the pitch');
        setText(capEl, 'cap', S.state === 'decayed' ? 'last: ' + signed(c, 1) + '¢' : '');
      }
      setText(partialTxt, 'chip', 'Listening to partial ' + S.n + ' · ' + S.p.toFixed(1) + ' Hz');   // target partial, not the measurement
      setAttr(dots, 'dots', 'data-level', String(S.conf));
      setAttr(dots, 'dotsAria', 'aria-label', 'Confidence ' + S.conf + '/4');
      var src = MEASURED[k];
      setText(bChip, 'b', src ? 'B measured (' + src + ')' : 'B modelled');
      setAttr(bChip, 'bcls', 'class', 'rc-tuner__badge ' + (src ? 'rc-tuner__badge--measured' : 'rc-tuner__badge--grey'));
      var n = 0; for (var i = 1; i <= 88; i++) if (S.tuned[i]) n++;
      setText(countEl, 'count', 'Tuned ' + n + '/88');
      updateGuide(n);
      var can = S.conf >= 3;
      if (cache.can !== can) { cache.can = can; markBtn.disabled = !can; }
      var flash = S.markFlash >= 0 && S.t < S.markFlash;
      if (cache.flash !== flash) { cache.flash = flash; markBtn.classList.toggle('is-pressed', flash); }
      setText(specCap, 'specCap', 'auto → n* = ' + S.n);
      setAttr(specCv, 'specAria', 'aria-label', 'Spectrum of the simulated string, tracked partial ' + S.n);
      setText(dbEl, 'db', dbfs(S.level));

      var has = col !== 'idle' && S.state !== 'decayed';
      var fm = has ? S.p * Math.pow(2, S.cents / 1200) : 0;
      setText(detailEls.f_meas, 'd1', has ? fm.toFixed(3) + ' Hz' : '—');
      setText(detailEls.f1_equiv, 'd2', has ? (fm / (S.n * ratio(S.n, S.B))).toFixed(3) + ' Hz' : '—');
      setText(detailEls['target f1'], 'd3', S.f1.toFixed(3) + ' Hz');
      setText(detailEls['target p_n*'], 'd4', S.p.toFixed(3) + ' Hz');
      setText(detailEls['n*'], 'd5', String(S.n));
      setText(detailEls.B_k, 'd6', sci(S.B) + ' (' + (src || 'modelled') + ')');
      setText(detailEls['cents raw'], 'd7', has && S.raw != null ? signed(S.raw, 2) + '¢' : '—');
      setText(detailEls.state, 'd8', S.state);

      /* Accessible names: on state change, otherwise at most about once a second. */
      if (force || S.state !== lastAriaState || S.t - lastAria > 1.2) {
        lastAria = S.t; lastAriaState = S.state;
        var word = col === 'idle' ? 'Play a note' : signed(c, 1) + '¢ ' + (col === 'intune' ? 'in tune' : col) + (S.state === 'decayed' ? ', note decayed' : '');
        needleCv.setAttribute('aria-label', 'Needle: ' + word + ', scale ±' + (S.zoomed ? R_ZOOM : R_WIDE) + '¢');
        var on = strobeOn();
        strobeCv.setAttribute('aria-label', !on ? 'Strobe: inactive, active within ±15¢' : Math.abs(S.cents) < IN_TUNE_C ? 'Strobe: standing still' : 'Strobe: drifting ' + (S.cents < 0 ? 'left, flat' : 'right, sharp'));
        meterCv.setAttribute('aria-label', 'Input level ' + dbfs(S.level) + ' (simulated)');
        kb.setAttribute('aria-valuenow', String(k));
        kb.setAttribute('aria-valuetext', tipText(k));
      }
      if (cache.markKey !== k) { cache.markKey = k; marker.style.left = ((WHITE_INDEX[k] + (isBlack(k) ? 0 : 0.5)) / WHITE_COUNT * 100) + '%'; }
    }

    function syncPin() {
      var v = clamp(pinGet(), -30, 30);
      if (cache.pin !== v) {
        cache.pin = v; pin.value = String(v);
        pin.style.setProperty('--rc-pin-rot', (v * 9).toFixed(1) + 'deg');
        pin.setAttribute('aria-valuetext', signed(v, 1) + ' cents');
      }
    }
    function say(t) { live.textContent = t; }

    function tipText(k) {
      var parts = [nameOf(k)];
      if (S.tuned[k]) parts.push('tuned');
      if (MEASURED[k]) { parts.push('measured'); parts.push('B = ' + sci(priorB(k))); } else parts.push('B ≈ ' + sci(priorB(k)) + ' (modelled)');
      return parts.join(' · ');
    }

    /* ================= Canvases ================= */
    var canvases = [needleCv, strobeCv, specCv, meterCv, kbCv].map(function (cv) { return { cv: cv, ctx: cv.getContext('2d'), w: 0, h: 0, dpr: 1 }; });
    var CN = canvases[0], CS = canvases[1], CP = canvases[2], CM = canvases[3], CK = canvases[4];

    function measure() {
      var rw = root.clientWidth, nowWide = rw >= 900;                // the same threshold as the container query in tuner.css
      if (rw && nowWide !== wide) { wide = nowWide; place(); }
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvases.forEach(function (c) {
        var w = c.cv.clientWidth, hh = c.cv.clientHeight;
        if (!w || !hh) { c.w = 0; return; }
        if (w !== c.w || hh !== c.h || dpr !== c.dpr) {
          c.w = w; c.h = hh; c.dpr = dpr;
          c.cv.width = Math.round(w * dpr); c.cv.height = Math.round(hh * dpr);
        }
      });
      dirty.needle = dirty.strobe = dirty.spec = dirty.kb = dirty.meter = true;
      if (!raf) draw();
    }
    function begin(c) { c.ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0); c.ctx.clearRect(0, 0, c.w, c.h); c.ctx.globalAlpha = 1; return c.ctx; }

    /* ---------- NeedleView ---------- */
    var lastNeedleSig = '';
    function drawNeedle() {
      var c = CN; if (!c.w) return;
      var tone = stateColor();
      var sig = [V.needle.toFixed(3), V.range.toFixed(2), V.glow.toFixed(2), V.dim.toFixed(2), tone, c.w, c.h].join('|');
      if (!dirty.needle && sig === lastNeedleSig) return;
      lastNeedleSig = sig; dirty.needle = false;
      var ctx = begin(c), W = c.w, H = c.h;
      var s = W < 480 ? W / 480 : W > 700 ? W / 700 : 1;          // app sizes are absolute pt; scaled outside 480-700 px
      var px = W / 2, py = 0.98 * H, R = Math.min(0.9 * H, 0.98 * W / 2), r = V.range;   // NeedleDial: pivot (W/2, 0.98H), radius min(0.9H, 0.98W/2)
      function ang(v) { return (-90 + clamp(v, -r, r) / r * 60) * Math.PI / 180; }       // 120 degree sweep
      function pt(v, rho) { var a = ang(v); return [px + rho * Math.cos(a), py + rho * Math.sin(a)]; }
      ctx.globalAlpha = 1 - 0.4 * V.dim;                                                 // Decayed: whole canvas at 60 %
      var base = ctx.globalAlpha;
      /* 1 green zone */
      ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, R, ang(-IN_TUNE_C), ang(IN_TUNE_C)); ctx.closePath();
      ctx.globalAlpha = base * 0.25; ctx.fillStyle = T['in-tune']; ctx.fill(); ctx.globalAlpha = base;
      /* 2 arc */
      ctx.beginPath(); ctx.arc(px, py, R, ang(-r), ang(r)); ctx.strokeStyle = T.hairline; ctx.lineWidth = 2 * s; ctx.lineCap = 'butt'; ctx.stroke();
      /* 3 ticks: 21 fixed positions, only the labels change with the range */
      var fs = Math.max(10, Math.round(13 * s)), sparse = s < 0.8;
      ctx.font = '400 ' + fs + 'px ' + F.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var i = 0; i <= 20; i++) {
        var v = -r + i * r / 10, major = i % 2 === 0, a = pt(v, R), b = pt(v, R - (major ? 14 : 7) * s);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = major ? T['text-2'] : T.hairline; ctx.lineWidth = (major ? 2 : 1) * s; ctx.stroke();
        if (major && (!sparse || (i / 2) % 2 === 1)) { var l = pt(v, R - 26 * s - (sparse ? 2 : 0)); ctx.fillStyle = T['text-2']; ctx.fillText(signed(Math.round(v), 0), l[0], l[1]); }
      }
      /* 5 needle (+ glow in InTune) */
      var col = tone === 'idle' ? T['text-2'] : tone === 'intune' ? T['in-tune'] : tone === 'flat' ? T.flat : T.sharp;
      var tip = pt(V.needle, R - 4 * s);
      if (V.glow > 0.01) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tip[0], tip[1]); ctx.globalAlpha = base * 0.35 * V.glow; ctx.strokeStyle = T['in-tune']; ctx.lineWidth = 12 * s; ctx.lineCap = 'butt'; ctx.stroke(); ctx.globalAlpha = base; }
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tip[0], tip[1]); ctx.strokeStyle = col; ctx.lineWidth = 4 * s; ctx.lineCap = 'round'; ctx.stroke();
      /* 6 hub */
      ctx.beginPath(); ctx.arc(px, py, 8 * s, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      /* 7 range caption */
      ctx.fillStyle = T['text-2']; ctx.fillText('±' + Math.round(r) + '¢', W - 24 * Math.max(s, 0.8), H - 10);
      /* idle caption */
      if (tone === 'idle') {
        var cf = Math.max(12, Math.round(15 * s)); ctx.font = '400 ' + cf + 'px ' + F.ui;
        var text = 'Play a note', tw = ctx.measureText(text).width, cy = py - R * 0.42;
        roundRect(ctx, px - tw / 2 - 12, cy - cf * 0.95, tw + 24, cf * 1.9, cf); ctx.fillStyle = T.bg; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = T['text-2']; ctx.fillText(text, px, cy + 1);
      }
      ctx.globalAlpha = 1;
    }

    /* ---------- StrobeView ---------- */
    var lastStrobeSig = '';
    function drawStrobe() {
      var c = CS; if (!c.w) return;
      var sig = [V.phase.toFixed(4), V.mix.toFixed(2), c.w].join('|');
      if (!dirty.strobe && sig === lastStrobeSig) return;
      lastStrobeSig = sig; dirty.strobe = false;
      var ctx = begin(c), W = c.w, H = c.h, s = Math.min(1, W / 480);
      roundRect(ctx, 0, 0, W, H, 6 * Math.max(s, 0.7)); ctx.fillStyle = T['surface-2']; ctx.fill();
      var seg = W / 24, period = 2 * seg, off = V.phase * period, inset = 4 * s;     // 24 segments, 12 stripes; sharp drifts right
      function stripes() {
        for (var i = -1; i <= 24; i++) {
          var x0 = Math.max(0, i * period + off), x1 = Math.min(W, i * period + off + seg);
          if (x1 - x0 > 0.5) { roundRect(ctx, x0, inset, x1 - x0, H - 2 * inset, 3 * s); ctx.fill(); }
        }
      }
      if (V.mix < 0.999) { ctx.globalAlpha = 0.35 * (1 - V.mix); ctx.fillStyle = T['text-2']; stripes(); }
      if (V.mix > 0.001) { ctx.globalAlpha = V.mix; ctx.fillStyle = T.accent; stripes(); }
      if (V.mix < 0.5) {
        ctx.globalAlpha = 1 - 2 * V.mix;
        var fs = Math.max(10.5, 13 * s); ctx.font = '400 ' + fs + 'px ' + F.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var text = 'strobe active within ±15¢', tw = ctx.measureText(text).width;
        roundRect(ctx, W / 2 - tw / 2 - 10, 2, tw + 20, H - 4, 5); ctx.fillStyle = T['surface-2']; ctx.fill();
        ctx.fillStyle = T['text-2']; ctx.fillText(text, W / 2, H / 2 + 1);
      }
      ctx.globalAlpha = 1;
    }

    /* ---------- SpectrumView ---------- */
    var BASES = {
      bass: [-30, -21, -16, -14, -19, -23, -28, -33, -38, -44, -50, -55],
      mid: [-18, -14, -26, -31, -40, -44, -52, -58, -63, -68],
      high: [-13, -27, -41, -52, -60, -66, -70, -74],
      top: [-12, -30, -48]
    };
    function drawSpectrum() {
      var c = CP; if (!c.w || !dirty.spec) return;
      dirty.spec = false;
      var ctx = begin(c), W = c.w, H = c.h, k = S.key, nm = nMax(k), B = S.B, f1 = S.f1;
      roundRect(ctx, 0, 0, W, H, 8); ctx.fillStyle = T['surface-2']; ctx.fill();
      var X = 30, Y = 6, PW = W - 36, PH = H - 22;                                  // SpectrumView:24 plot rect
      var fLo = f1 / Math.SQRT2, fHi = Math.pow(2, 0.25) * nm * f1 * ratio(nm, B), lLo = Math.log2(fLo), lSpan = Math.log2(fHi) - lLo;
      function xf(f) { return X + (Math.log2(f) - lLo) / lSpan * PW; }
      function yd(d) { return Y + (1 - (clamp(d, -90, 0) + 90) / 90) * PH; }
      ctx.font = '500 10px ' + F.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
      [-90, -60, -30, 0].forEach(function (d) {
        var y = Math.round(yd(d)) + 0.5; ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X + PW, y); ctx.strokeStyle = T.hairline; ctx.stroke();
        ctx.fillStyle = T['text-2']; ctx.fillText(String(d), 14, y);                 // plain Int: ASCII hyphen here, as in the app
      });
      var floor = -78, yfl = Math.round(yd(floor)) + 0.5;
      ctx.setLineDash([2, 3]); ctx.globalAlpha = 0.35; ctx.strokeStyle = T['text-2']; ctx.beginPath(); ctx.moveTo(X, yfl); ctx.lineTo(X + PW, yfl); ctx.stroke(); ctx.globalAlpha = 1;
      /* predicted partial markers */
      var n, x, lastLabel = -99, trackedX = xf(S.p);
      for (n = 1; n <= nm; n++) {
        var pn = n * f1 * ratio(n, B); if (pn < fLo || pn > fHi) continue;
        x = Math.round(xf(pn)) + 0.5; var tracked = n === S.n;
        ctx.beginPath(); ctx.moveTo(x, Y); ctx.lineTo(x, Y + PH);
        if (tracked) { ctx.setLineDash([]); ctx.strokeStyle = T.reference; ctx.lineWidth = 2; ctx.globalAlpha = 1; }
        else { ctx.setLineDash([4, 3]); ctx.strokeStyle = T.accent; ctx.lineWidth = 1; ctx.globalAlpha = 0.7; }
        ctx.stroke(); ctx.globalAlpha = 1;
        if (tracked || (x - lastLabel >= 10 && Math.abs(x - trackedX) >= 10)) { ctx.fillStyle = tracked ? T.reference : T.accent; ctx.fillText(String(n), x, H - 8); lastLabel = x; }   // crowded top partials: skip labels that would collide
      }
      ctx.setLineDash([]);
      /* synthetic magnitude trace: decaying partial peaks over a grassy floor */
      var bases = k <= 27 ? BASES.bass : k <= 63 ? BASES.mid : k <= 75 ? BASES.high : BASES.top;
      var age = S.strikeT >= 0 ? S.t - S.strikeT : -1, shift = Math.pow(2, S.err[k] / 1200), peaks = [];
      if (age >= 0) for (n = 1; n <= nm; n++) {
        var lv = (bases[n - 1] != null ? bases[n - 1] : -70) + (S.peak0 + 9) - S.rate * (1 + 0.16 * (n - 1)) * age;
        if (lv > floor - 6) peaks.push([n * f1 * ratio(n, B) * shift, lv]);
      }
      ctx.beginPath();
      var cols = Math.floor(PW / 1.5), colHz = (Math.pow(2, lSpan / cols) - 1) / 2;   // max-hold over the column's own span, like the decimated bins
      for (var i = 0; i <= cols; i++) {
        var f = Math.pow(2, lLo + lSpan * i / cols), d = floor - 3 + 7 * hash2(i, S.frame % 97) * hash2(i + 9, 3);
        for (var j = 0; j < peaks.length; j++) { var q = Math.max(0, Math.abs(f - peaks[j][0]) - f * colHz) / 5, pd = peaks[j][1] - 20 * Math.log10(1 + q * q * q); if (pd > d) d = pd; }
        var xx = X + PW * i / cols, yy = yd(d); if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
      }
      ctx.globalAlpha = 0.85; ctx.strokeStyle = T.text; ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = T.reference;
      peaks.forEach(function (p) { if (p[1] > floor + 8 && p[0] > fLo && p[0] < fHi) { ctx.beginPath(); ctx.arc(xf(p[0]), yd(p[1]), 2.5, 0, Math.PI * 2); ctx.fill(); } });
      var rangeText = Math.round(fLo) + ' Hz … ' + Math.round(fHi) + ' Hz', rw = ctx.measureText(rangeText).width;
      ctx.globalAlpha = 0.88; ctx.fillStyle = T['surface-2']; ctx.fillRect(X + PW - rw - 9, Y + 1, rw + 9, 14); ctx.globalAlpha = 1;   // keeps the caption legible over the markers
      ctx.fillStyle = T['text-2']; ctx.textAlign = 'right'; ctx.fillText(rangeText, X + PW - 4, Y + 8);
    }

    /* ---------- LevelMeterView (height 6) ---------- */
    function drawMeter() {
      var c = CM; if (!c.w || !dirty.meter) return;
      dirty.meter = false;
      var ctx = begin(c), W = c.w, H = c.h;
      function xl(d) { return clamp((d + 60) / 60, 0, 1) * W; }
      roundRect(ctx, 0, 0, W, H, H / 2); ctx.fillStyle = T['surface-2']; ctx.fill();
      ctx.save(); roundRect(ctx, 0, 0, W, H, H / 2); ctx.clip();
      ctx.fillStyle = S.level > -6 ? T.warn : T['in-tune']; ctx.fillRect(0, 0, xl(S.level), H);
      ctx.globalAlpha = 0.25; ctx.fillStyle = T['text-2']; ctx.fillRect(0, 0, xl(-56), H); ctx.globalAlpha = 1;
      ctx.fillStyle = T.text; ctx.fillRect(xl(S.hold) - 1.5, 0, 3, H);
      ctx.fillStyle = T.reference; ctx.fillRect(Math.round(xl(-12)), 0, 1, H);     // -12 dBFS target
      ctx.restore();
    }

    /* ---------- KeyboardView ---------- */
    function keyRect(k, W, H) {
      var ww = W / WHITE_COUNT;
      if (!isBlack(k)) return [WHITE_INDEX[k] * ww, 0, ww, H];
      var bw = 0.6 * ww; return [WHITE_INDEX[k] * ww - bw / 2, 0, bw, 0.62 * H];   // centred on the boundary
    }
    function keyAt(x, y) {
      var W = CK.w, H = CK.h, k, r; if (!W) return 0;
      for (k = 1; k <= 88; k++) if (isBlack(k)) { r = keyRect(k, W, H); if (x >= r[0] && x <= r[0] + r[2] && y <= r[3]) return k; }
      for (k = 1; k <= 88; k++) if (!isBlack(k)) { r = keyRect(k, W, H); if (x >= r[0] && x < r[0] + r[2]) return k; }
      return 0;
    }
    function drawKeyboard() {
      var c = CK; if (!c.w || !dirty.kb) return;
      dirty.kb = false;
      var ctx = begin(c), W = c.w, H = c.h, pass, k;
      var small = W < 560, rad = small ? 1 : 2;
      function drawKey(k) {
        var r = keyRect(k, W, H), x = r[0] + 0.5, y = 0.5, w = r[2] - 1, hh = r[3] - 1, black = isBlack(k);
        roundRect(ctx, x, y, w, hh, rad); ctx.fillStyle = black ? T['black-key'] : T['white-key']; ctx.fill();
        if (S.tuned[k]) { roundRect(ctx, x, y + hh * 0.3, w, hh * 0.7, rad); ctx.fillStyle = T['in-tune']; ctx.fill(); }   // bottom 70 %
        roundRect(ctx, x, y, w, hh, rad); ctx.strokeStyle = T.bg; ctx.lineWidth = 1; ctx.stroke();
        if (MEASURED[k]) { var d = Math.min(0.5 * r[2], 7); ctx.beginPath(); ctx.arc(r[0] + r[2] / 2, 0.8 * r[3], d / 2, 0, Math.PI * 2); ctx.fillStyle = T.measured; ctx.fill(); }
        var si = SUGGESTED.indexOf(k);
        if (si >= 0 && k !== S.key) {
          ctx.globalAlpha = V.pulse; roundRect(ctx, x + 0.5, y + 0.5, w - 1, hh - 1, rad); ctx.strokeStyle = T.reference; ctx.lineWidth = small ? 1.5 : 2; ctx.stroke(); ctx.globalAlpha = 1;
          if (!small) { ctx.font = '500 10px ' + F.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = black ? T.reference : T['black-key']; ctx.fillText(String(si + 1), r[0] + r[2] / 2, 10); }
        }
        if (k === S.key) { roundRect(ctx, x, y, w, hh, rad); ctx.strokeStyle = T.text; ctx.lineWidth = small ? 2 : 3; ctx.stroke(); }   // Theme.currentKeyOutline
        if (k === hoverKey) { roundRect(ctx, x, y, w, hh, rad); ctx.globalAlpha = 0.2; ctx.fillStyle = T.accent; ctx.fill(); ctx.globalAlpha = 1; }
      }
      for (pass = 0; pass < 2; pass++) for (k = 1; k <= 88; k++) if (isBlack(k) === (pass === 1)) drawKey(k);
      ctx.strokeStyle = T.reference; ctx.lineWidth = 2;
      BOUNDARIES.forEach(function (b) { var x = keyRect(b, W, H)[0]; ctx.beginPath(); ctx.moveTo(x, H - 6); ctx.lineTo(x, H); ctx.stroke(); });
      ctx.font = '500 ' + (small ? 8 : 10) + 'px ' + F.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = T['black-key'];
      [[1, 'A0'], [40, 'C4'], [88, 'C8']].forEach(function (l) {
        if (small && l[0] !== 40) return;                                           // keys are under 7 px wide on phones
        var r = keyRect(l[0], W, H), tw = ctx.measureText(l[1]).width / 2 + 1; ctx.fillText(l[1], clamp(r[0] + r[2] / 2, tw, W - tw), H - (small ? 6 : 9));
      });
    }

    /* The wobble lamp in the guide's status line: one style write per frame, only while it changes. */
    function drawWobble() {
      var p = G.panels[G.idx]; if (!p) return;
      var w = V.wob.toFixed(2);
      if (w !== lastWob) { lastWob = w; p.wob.style.setProperty('--rc-wob', w); }
    }

    var kbClock = 0;
    function draw() {
      drawNeedle(); drawStrobe(); drawSpectrum(); drawMeter(); drawKeyboard(); drawWobble();
    }

    /* ================= Loop ================= */
    function tick(now) {
      if (!active) { raf = 0; return; }
      var dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
      step(dt);
      kbClock += dt; if (kbClock >= 0.05) { kbClock = 0; dirty.kb = true; }         // suggested-next pulse redraws at 20 fps
      draw();
      raf = requestAnimationFrame(tick);
    }
    function start() { if (raf || !active || env.reduceMotion) return; lastNow = performance.now(); raf = requestAnimationFrame(tick); }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    /* ================= Simple / Advanced ================= */
    /* Wide + Advanced: the Details card sits under the strobe so the two columns balance; otherwise next to the spectrum. */
    function place() { var target = advanced && wide ? colA : extras; if (detCard.parentNode !== target) target.appendChild(detCard); }
    var modeAnim = null;
    function finishModeAnim() { if (modeAnim) { clearTimeout(modeAnim.timer); modeAnim.done(); modeAnim = null; } }
    function visible(n) { return !n.hidden && n.offsetParent !== null; }

    /* The app's 200 ms easeInOut state change: what comes fades in, what goes fades out, what stays glides to its new place. */
    function setAdvanced(on, instant) {
      on = !!on; if (on === advanced) return;
      finishModeAnim();
      advanced = on;
      switchBtn.setAttribute('aria-checked', on ? 'true' : 'false');
      if (instant || env.reduceMotion || !root.clientWidth) { root.setAttribute('data-adv', on ? 'on' : 'off'); ADV.forEach(function (n) { n.hidden = !on; }); place(); measure(); return; }

      var movers = [needleBox, guide, controls, levelRow, kb], r0 = root.getBoundingClientRect();
      var before = movers.map(function (n) { return n.getBoundingClientRect(); });
      var leaving = [];
      root.setAttribute('data-adv', on ? 'on' : 'off');               // after the "before" rects: the attribute changes the layout
      if (on) { place(); ADV.forEach(function (n) { n.hidden = false; n.classList.add('is-entering'); }); }
      else {
        leaving = ADV.filter(function (n) { return visible(n) && !(n === detCard && detCard.parentNode === extras); });   // inside `extras` the Details card leaves with it
        var rects = leaving.map(function (n) { return n.getBoundingClientRect(); });
        leaving.forEach(function (n, i) {                               // lift them out of the flow where they stand
          n.style.position = 'absolute'; n.style.left = (rects[i].left - r0.left) + 'px'; n.style.top = (rects[i].top - r0.top) + 'px';
          n.style.width = rects[i].width + 'px'; n.style.height = rects[i].height + 'px'; n.style.margin = '0';
        });
      }
      var r1 = root.getBoundingClientRect();
      movers.forEach(function (n, i) {
        var a = n.getBoundingClientRect(), dx = (before[i].left - r0.left) - (a.left - r1.left), dy = (before[i].top - r0.top) - (a.top - r1.top);
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) { n.style.transition = 'none'; n.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)'; }
      });
      root.style.height = r0.height + 'px';
      void root.offsetHeight;                                           // commit the "before" frame
      root.classList.add('is-morphing');
      movers.forEach(function (n) { n.style.transition = ''; n.style.transform = ''; });
      leaving.forEach(function (n) { n.classList.add('is-leaving'); });
      root.style.height = r1.height + 'px';
      measure();
      modeAnim = {
        timer: setTimeout(function () { finishModeAnim(); }, 240),
        done: function () {
          root.classList.remove('is-morphing'); root.style.height = '';
          movers.forEach(function (n) { n.style.transition = ''; n.style.transform = ''; });
          ADV.forEach(function (n) { n.classList.remove('is-entering', 'is-leaving'); n.hidden = !advanced; n.style.position = n.style.left = n.style.top = n.style.width = n.style.height = n.style.margin = ''; });
          place(); measure();
        }
      };
    }
    switchBtn.addEventListener('click', function () { setAdvanced(!advanced); });

    /* ================= Interaction ================= */
    function enterUser() {
      if (mode === 'user') return;
      mode = 'user'; S.pull = null; S.advanceAt = -1; resumeBtn.hidden = false;
    }
    function afterUserChange() { if (env.reduceMotion) settle(); else if (!raf) { updateDom(true); draw(); } }
    function userSelect(k) {                         // a new note starts at step 1: the guide waits for it to be played
      enterUser(); selectKey(k);
      say('Selected ' + nameOf(S.key) + '. Step 1 of ' + G.steps.length + ': ' + guideTitle(stepNow(), stringsOf(S.key)));
      updateDom(true); afterUserChange();
    }
    pin.addEventListener('pointerdown', enterUser);
    pin.addEventListener('input', function () {
      enterUser();
      var v = parseFloat(pin.value); pinSet(v); cache.pin = v;
      pin.style.setProperty('--rc-pin-rot', (v * 9).toFixed(1) + 'deg'); pin.setAttribute('aria-valuetext', signed(v, 1) + ' cents');
      if ((isMatch(stepNow()) && !G.unmuted) || !S.confident || S.sig < -40) strike();   // turning the pin of a silent string would show nothing: re-strike
      dirty.spec = true; afterUserChange();
    });
    strikeBtn.addEventListener('click', function () { enterUser(); strike(); afterUserChange(); });
    markBtn.addEventListener('click', function () {
      enterUser(); var name = nameOf(S.key);
      if (markTuned()) {
        say('Marked ' + name + ' tuned');
        if (env.reduceMotion) { S.advanceAt = -1; if (S.key < 88) selectKey(S.key + 1); }
        afterUserChange();
      }
    });
    prevBtn.addEventListener('click', function () { userSelect(S.key - 1); });
    nextBtn.addEventListener('click', function () { userSelect(S.key + 1); });
    gNext.addEventListener('click', function () { enterUser(); advanceGuide(); afterUserChange(); });
    gPrev.addEventListener('click', function () { if (S.key > 1) userSelect(S.key - 1); });
    gSkip.addEventListener('click', function () { if (S.key < 88) userSelect(S.key + 1); });
    resumeBtn.addEventListener('click', function () {
      mode = 'demo'; resumeBtn.hidden = true; resetAll(env.reduceMotion); say('Demo resumed');
      strikeBtn.focus(); if (!raf) draw();
    });
    el.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var inRange = e.target === pin;
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !inRange) { e.preventDefault(); userSelect(S.key + (e.key === 'ArrowRight' ? 1 : -1)); }
      else if ((e.key === 'm' || e.key === 'M') && !inRange && advanced) { markBtn.click(); }
      else if ((e.key === 'Home' || e.key === 'End') && e.target === kb) { e.preventDefault(); userSelect(e.key === 'Home' ? 1 : 88); }
    });
    function kbPos(e) { var r = kbCv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    kbCv.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var p = kbPos(e), k = keyAt(p[0], p[1]);
      if (k !== hoverKey) {
        hoverKey = k; dirty.kb = true;
        if (k) { tip.textContent = tipText(k); tip.hidden = false; var half = tip.offsetWidth / 2; tip.style.left = clamp(p[0], half, CK.w - half) + 'px'; } else tip.hidden = true;
        if (!raf) draw();
      } else if (k) { var hw = tip.offsetWidth / 2; tip.style.left = clamp(p[0], hw, CK.w - hw) + 'px'; }
    });
    kbCv.addEventListener('pointerleave', function () { hoverKey = 0; tip.hidden = true; dirty.kb = true; if (!raf) draw(); });
    kbCv.addEventListener('click', function (e) { var p = kbPos(e), k = keyAt(p[0], p[1]); if (k) userSelect(k); });

    /* ================= Lifecycle ================= */
    var ro = 'ResizeObserver' in window ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(root); else window.addEventListener('resize', measure);
    env.onReduceMotionChange(function (rm) {
      if (destroyed) return;
      stop(); finishModeAnim(); mode = 'demo'; resumeBtn.hidden = true; resetAll(rm); draw(); start();
    });

    resetAll(env.reduceMotion);
    measure();

    function run(t) { for (var i = 0, n = Math.round(t * 60); i < n; i++) step(1 / 60); updateDom(true); dirty.needle = dirty.strobe = dirty.spec = dirty.kb = dirty.meter = true; draw(); }
    return {
      setActive: function (on) { active = !!on; if (active) { start(); if (!raf) draw(); } else stop(); },
      /* Dev harness: fast-forward the autoplay loop to t seconds (no-op under Reduce Motion). */
      seek: function (t) { if (env.reduceMotion) return; mode = 'demo'; resumeBtn.hidden = true; resetAll(false); run(t); },
      /* Dev harness: run the simulation forward t seconds in the current mode. */
      advance: function (t) { if (!env.reduceMotion) run(t); },
      /* Dev harness: the switch (without the transition unless animate is set), and the visitor picking a note. */
      setAdvanced: function (on, animate) { setAdvanced(on, !animate); },
      select: function (k) { userSelect(k); },
      /* Dev harness: where the guide stands. */
      peek: function () { var p = G.panels[G.idx]; return { t: +S.t.toFixed(2), key: nameOf(S.key), step: stepNow(), idx: G.idx + 1, of: G.steps.length, status: p ? p.text.textContent : '', cents: S.cents == null ? null : +S.cents.toFixed(2), state: S.state, mode: mode }; },
      destroy: function () { destroyed = true; active = false; stop(); finishModeAnim(); if (ro) ro.disconnect(); else window.removeEventListener('resize', measure); el.textContent = ''; }
    };
  };
})();
