/* survey.js — live recreation of the Survey view (SurveyMeterView + the keyboard map + SurveyResultCard),
   with a pitch-raise / overpull coda (PitchRaise.swift). Illustrative, synthetic values; silent.
   Contract: js/main.js — window.ResonanceComponents.survey = mount(el, env) -> { setActive, destroy, seek }. */
(function () {
  'use strict';

  var MINUS = '−';
  var SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];   // Key.swift sharpNames
  var SURVEY_GOOD = '#5B9CFF', SURVEY_MILD = '#3ED6C9';   // Theme.Palette.surveyGood / surveyMild (not site tokens)

  /* ---------- keys (KeyboardView.swift: 88 keys, 52 white, MIDI = k + 20) ---------- */
  var KEYS = [];
  (function () {
    var w = 0;
    for (var k = 1; k <= 88; k++) {
      var midi = k + 20, pc = midi % 12;
      var black = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
      KEYS[k] = { k: k, black: black, wi: w, name: SHARP_NAMES[pc] + (Math.floor(midi / 12) - 1) };
      if (!black) w++;
    }
  })();

  /* ---------- formatting (Theme.Format: typographic minus, explicit plus, bare zero) ---------- */
  function signed(v, dec) {
    var m = Math.abs(v).toFixed(dec);
    if (parseFloat(m) === 0) return m;
    return (v < 0 ? MINUS : '+') + m;
  }
  function cents(v, dec) { return signed(v, dec || 0) + '¢'; }
  function band(c) { var d = Math.abs(c); return d <= 15 ? 'good' : d <= 50 ? 'little' : d <= 100 ? 'well' : 'very'; }   // SurveyExplanation.band
  function pitchWord(c) {   // SurveyPalette.pitchWord
    var dir = c < 0 ? 'flat' : 'sharp', b = band(c);
    return b === 'good' ? 'in tune' : b === 'little' ? 'a little ' + dir : b === 'well' ? 'well ' + dir : 'very ' + dir;
  }
  function spoken(c) { var r = Math.round(c); return (r === 0 ? '0' : Math.abs(r) + '') + ' cents' + (r < 0 ? ' flat' : r > 0 ? ' sharp' : ''); }

  /* ---------- colour: perceptual (OKLab) blend, as Color.mix(in: .perceptual) ---------- */
  function hexToRgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec((h || '').trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function fromLin(c) { c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, c)) * 255); }
  function toLab(rgb) {
    var r = toLin(rgb[0]), g = toLin(rgb[1]), b = toLin(rgb[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromLab(L) {
    var l = Math.pow(L[0] + 0.3963377774 * L[1] + 0.2158037573 * L[2], 3);
    var m = Math.pow(L[0] - 0.1055613458 * L[1] - 0.0638541728 * L[2], 3);
    var s = Math.pow(L[0] - 0.0894841775 * L[1] - 1.291485548 * L[2], 3);
    return [fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
  }
  function makeRamp(warn, sharp) {
    /* SurveyPalette.pitchColour: blue to ±10¢ → teal by 25¢ → amber by 45¢ → red by 100¢ */
    var stops = [[10, SURVEY_GOOD], [25, SURVEY_MILD], [45, warn], [100, sharp]].map(function (s) { return [s[0], toLab(hexToRgb(s[1]))]; });
    return function (c) {
      var d = Math.abs(c), lab = stops[3][1];
      if (d <= stops[0][0]) lab = stops[0][1];
      else for (var i = 1; i < 4; i++) if (d <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i], t = (d - a[0]) / (b[0] - a[0]);
        lab = [a[1][0] + (b[1][0] - a[1][0]) * t, a[1][1] + (b[1][1] - a[1][1]) * t, a[1][2] + (b[1][2] - a[1][2]) * t];
        break;
      }
      var rgb = fromLab(lab);
      return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
    };
  }

  /* ---------- synthetic pianos (illustrative — not a recording of any instrument) ---------- */
  function rng(seed) {   // mulberry32
    return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  var SCENARIOS = {
    close: {
      label: 'Close to pitch', seed: 11, sigma: 2.4, floor: -30,
      base: function (x) { return -2 - 5 * Math.pow(x, 1.5); },
      fixed: { 14: -17, 79: -19 }, unisons: {}, mean: null,
      headline: 'Your piano is close to pitch.',
      rec: function () { return 'No pitch raise needed — go straight to Measure and fine-tune.'; },
      explain: false, warning: false, coda: null
    },
    raise: {
      label: 'Needs a pitch raise', seed: 7, sigma: 2.6, floor: -97,
      base: function (x) { return -9 - 85 * x * x; },   // close in the bass, drifting flatter toward the treble
      fixed: { 25: -58, 35: -35, 40: -30, 57: -79 },
      unisons: { 35: { spread: 24, beat: 2.7 }, 55: { spread: 6, beat: 2.2 } },   // G3 (196 Hz): 24¢ ≈ 2.7 beats/s
      mean: -38,
      headline: 'Your piano needs a pitch raise first.',
      rec: function () { return 'Do one pitch-raise pass first, then measure and fine-tune.'; },
      explain: true, warning: false,
      /* PitchRaise.swift: Φ_eff = 0.85·Φ̄ + 0.15·Φ = 0.85·27.4 + 0.15·30 = 27.8; ρ(C4) = 0.30 → overpull +8.3¢ */
      coda: {
        lo: -40, hi: 20, step: 10, now: -30, aim: 8.3, settle: 1, overpull: true,
        badge: 'Aiming +8.3¢ sharp on purpose — the string will settle', chip: 'Overpull +8¢',
        numbers: ['+8¢', '0¢', '+30¢', '+27¢'],
        status: ['C4 reads 30¢ flat, and the keys around it about 27¢ flat.',
          'Pull it past the final target, up to the amber marker: 8.3¢ sharp.',
          'As the rest of the piano comes up to tension, the string is expected to settle back toward the final target.'],
        caption: 'The overpull is an estimate from how flat the whole region is — never more than +30¢, +15¢ on wound strings.',
        aria: 'Overpull diagram for C4. The string is now 30 cents flat. The final target is 0. The app aims 8.3 cents sharp on purpose, expecting the string to settle back toward the target.'
      }
    },
    far: {
      label: 'Far flat', seed: 23, sigma: 4, floor: -160,
      base: function (x) { return -100 - 40 * Math.pow(x, 1.3); },
      fixed: { 30: -143, 40: -115, 66: -96 }, unisons: { 35: { spread: 31, beat: 3.5 }, 53: { spread: 8, beat: 2.6 } }, mean: null,
      headline: 'Your piano is far flat. It needs two pitch-raise passes first.',
      rec: function (p) { return 'The piano is up to ' + p.maxFlat + '¢ flat, so do two pitch-raise passes — the first brings every string to pitch, the second (after a fresh survey) aims a little sharp — then measure and fine-tune.'; },
      explain: true, warning: true,
      coda: {
        lo: -140, hi: 20, step: 20, now: -115, aim: 0, settle: -30, overpull: false,
        badge: 'Target = final curve target (no overpull)', chip: null,
        numbers: ['0¢', '0¢', '+115¢', '+114¢'],
        status: ['C4 reads 115¢ flat. Pass 1 has no overpull: every string simply goes to its final target.',
          'Bring it up to the marker. Within 3¢ is enough on this pass.',
          'It is expected to sag again as the other strings come up — so a fresh survey and a second pass, with overpull, follow.'],
        caption: 'Pass 2 aims a little sharp — never more than +30¢, +15¢ on wound strings.',
        aria: 'Pitch-raise diagram for C4, pass 1 of 2. The string is now 115 cents flat. Pass 1 aims at the final target with no overpull. The string is expected to sag again, so a second pass with overpull follows.'
      }
    }
  };
  var ORDER = ['close', 'raise', 'far'];
  var EXPLAIN = 'A pitch raise is a quick rough pass that brings every string close to pitch before the real tuning. Raising many strings adds tension to the frame and soundboard, which bends them slightly and pulls earlier strings flat again, so the app aims each string a little sharp on purpose and a second, precise pass then holds.';
  var WARNING = 'More than 100¢ of raise on old wound bass strings or above C7 risks breaking strings — go gently.';
  var INSTRUCTION = 'Play every key from A0 to C8, one at a time, no mutes, about one second each. The keyboard fills in as you go.';

  function buildPiano(id) {
    var sc = SCENARIOS[id], rand = rng(sc.seed), d = [], k;
    function gauss() { return (rand() + rand() + rand() + rand() - 2) * 1.73; }
    for (k = 1; k <= 88; k++) d[k] = Math.max(sc.floor, sc.base((k - 1) / 87) + gauss() * sc.sigma);
    for (k in sc.fixed) d[k] = sc.fixed[k];
    if (sc.mean !== null) {   // trim the free keys so the average lands on the quoted figure
      var sum = 0, free = 0;
      for (k = 1; k <= 88; k++) { sum += d[k]; if (!(k in sc.fixed)) free++; }
      var shift = (sc.mean * 88 - sum) / free;
      for (k = 1; k <= 88; k++) if (!(k in sc.fixed)) d[k] += shift;
    }
    /* running tallies after n keys: [good, little, far, unisons, sum] */
    var run = [[0, 0, 0, 0, 0]], g = 0, l = 0, f = 0, u = 0, s = 0, maxFlat = 0;
    for (k = 1; k <= 88; k++) {
      d[k] = Math.round(d[k]);   // the survey meter and summary show whole cents
      var b = band(d[k]);
      if (b === 'good') g++; else if (b === 'little') l++; else f++;
      if (sc.unisons[k]) u++;
      s += d[k]; maxFlat = Math.max(maxFlat, -d[k]);
      run[k] = [g, l, f, u, s];
    }
    return { id: id, sc: sc, d: d, run: run, maxFlat: maxFlat };
  }

  /* ---------- timeline (seconds). "Quicker than life": the real instruction says about one second per key. ---------- */
  var T0 = 0.9, KEY_T = [];
  (function () {
    var t = T0;
    for (var i = 0; i < 88; i++) { KEY_T[i] = t; t += Math.max(0.105, 0.5 * Math.pow(0.72, i)); }   // a few slow keys, then ~9.5 keys/s
  })();
  var T_SWEEP_END = KEY_T[87], T_VERDICT = T_SWEEP_END + 1.1, VERDICT_HOLD = 6.5, VERDICT_HOLD_ALONE = 9, CODA_LEN = 9.6;
  var NEEDLE_S = 0.1;   // Theme.Motion: needle 100 ms easeOut
  function easeOut(p) { return 1 - (1 - p) * (1 - p); }
  function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function mount(el, env) {
    var tk = env.tokens || {}, fonts = env.fonts || {};
    var C = {
      bg: tk.bg || '#0F1115', text: tk.text || '#E8EAF0', text2: tk['text-2'] || '#9AA3B2', hairline: tk.hairline || 'rgba(232,234,240,.12)',
      accent: tk.accent || '#4FA3FF', reference: tk.reference || '#FFB454', warn: tk.warn || '#FFC53D', sharp: tk.sharp || '#FF6B6B',
      surface: tk.surface || '#171A21', white: tk['white-key'] || '#E8EAF0', black: tk['black-key'] || '#1F2430', surface2: tk['surface-2'] || '#1F2430'
    };
    var uiFont = fonts.ui || 'system-ui, sans-serif';
    var ramp = makeRamp(hexToRgb(C.warn) ? C.warn : '#FFC53D', hexToRgb(C.sharp) ? C.sharp : '#FF6B6B');
    function zoneColour(c) { var d = Math.abs(Math.round(c)); return d <= 15 ? SURVEY_GOOD : d <= 50 ? C.warn : C.sharp; }   // SurveyMeterView.colour

    /* ----- DOM ----- */
    var fb = el.querySelector('.rc-fallback'); if (fb) fb.remove();
    var root = h('div', 'rc-survey__root');

    var sw = h('div', 'rc-survey__switch'); sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Choose the piano to survey');
    var segs = {};
    ORDER.forEach(function (id) {
      var b = h('button', 'rc-survey__seg', SCENARIOS[id].label); b.type = 'button';
      b.addEventListener('click', function () { setScenario(id); });
      segs[id] = b; sw.appendChild(b);
    });

    var stage = h('div', 'rc-survey__stage');
    /* meter view */
    var vMeter = h('div', 'rc-survey__view rc-survey__view--meter');
    var meterBox = h('div', 'rc-survey__dial'); var meterCv = h('canvas'); meterCv.setAttribute('role', 'img'); meterBox.appendChild(meterCv);
    var readout = h('div', 'rc-survey__readout'); readout.setAttribute('aria-hidden', 'true');
    var rNote = h('span', 'rc-survey__note'), rCents = h('span', 'rc-survey__cents'), rWord = h('span', 'rc-survey__word'), rCap = h('span', 'rc-survey__cap');
    readout.appendChild(rNote); readout.appendChild(rCents); readout.appendChild(rWord); readout.appendChild(rCap);
    vMeter.appendChild(meterBox); vMeter.appendChild(readout); vMeter.appendChild(h('p', 'rc-survey__instr', INSTRUCTION));
    /* verdict view (SurveyResultCard) */
    var vVerdict = h('div', 'rc-survey__view rc-survey__view--verdict');
    var vTop = h('div', 'rc-survey__vtop'); var vCount = h('span', null, '');
    vTop.appendChild(h('span', null, 'Survey')); vTop.appendChild(vCount);
    var vHead = h('p', 'rc-survey__headline'), vRec = h('p', 'rc-survey__rec');
    var vWarn = h('p', 'rc-survey__warn'); vWarn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6 22 20.4H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5m0 2.6v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var vWarnText = h('span', null, WARNING); vWarn.appendChild(vWarnText);
    var vExplain = h('p', 'rc-survey__explain', EXPLAIN);
    var insp = h('div', 'rc-survey__insp'); insp.setAttribute('aria-hidden', 'true');
    var iNote = h('span', 'rc-survey__inote'), iCents = h('span', 'rc-survey__icents'), iWord = h('span', 'rc-survey__iword'), iUni = h('span', 'rc-survey__iuni'), iHint = h('span', 'rc-survey__ihint');
    [iNote, iCents, iWord, iUni, iHint].forEach(function (n) { insp.appendChild(n); });
    var vBody = h('div', 'rc-survey__vbody'); [vHead, vRec, vWarn, vExplain].forEach(function (n) { vBody.appendChild(n); });
    [vTop, vBody, insp].forEach(function (n) { vVerdict.appendChild(n); });
    /* coda view (PitchRaiseView instruction card, abstracted to one note) */
    var vCoda = h('div', 'rc-survey__view rc-survey__view--coda');
    var cTop = h('div', 'rc-survey__ctop');
    var cTitle = h('div', 'rc-survey__ctitle'); cTitle.appendChild(h('span', 'rc-survey__cnote', 'C4'));
    cTitle.appendChild(h('span', 'rc-survey__csub', 'Pitch Raise · Pass 1 · order A0 → C8'));
    var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14M12 20V9m-5 4.5L12 8.5l5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var cChip = h('span', 'rc-survey__chip'); var cChipText = h('span'); cChip.innerHTML = ARROW; cChip.appendChild(cChipText);
    cTop.appendChild(cTitle); cTop.appendChild(cChip);
    var cBadge = h('p', 'rc-survey__badge'); var cBadgeText = h('span'); cBadge.innerHTML = ARROW; cBadge.appendChild(cBadgeText);
    var codaBox = h('div', 'rc-survey__diagram'); var codaCv = h('canvas'); codaCv.setAttribute('role', 'img'); codaBox.appendChild(codaCv);
    var cStatus = h('div', 'rc-survey__status'); cStatus.setAttribute('aria-hidden', 'true');
    var cStat = [h('p'), h('p'), h('p')]; cStat.forEach(function (n) { cStatus.appendChild(n); });
    var cNums = h('p', 'rc-survey__nums');
    var cCaption = h('p', 'rc-survey__ccap');
    [cTop, cBadge, codaBox, cStatus, cNums, cCaption].forEach(function (n) { vCoda.appendChild(n); });
    stage.appendChild(vMeter); stage.appendChild(vVerdict); stage.appendChild(vCoda);

    /* keyboard map */
    var kb = h('div', 'rc-survey__kb'); kb.tabIndex = 0; kb.setAttribute('role', 'slider');
    kb.setAttribute('aria-label', 'Inspect a key of the survey map'); kb.setAttribute('aria-valuemin', '1'); kb.setAttribute('aria-valuemax', '88');
    var kbCv = h('canvas'); kbCv.setAttribute('aria-hidden', 'true');
    var tip = h('div', 'rc-survey__tip'); tip.setAttribute('aria-hidden', 'true'); var tipDot = h('i'), tipText = h('span'); tip.appendChild(tipDot); tip.appendChild(tipText);
    kb.appendChild(kbCv); kb.appendChild(tip);

    /* distribution + legend (SurveyResultCard.distribution) */
    var dist = h('div', 'rc-survey__dist'); dist.setAttribute('aria-hidden', 'true');
    var dGood = h('i', 'rc-survey__d rc-survey__d--good'), dLittle = h('i', 'rc-survey__d rc-survey__d--little'), dFar = h('i', 'rc-survey__d rc-survey__d--far');
    dist.appendChild(dGood); dist.appendChild(dLittle); dist.appendChild(dFar);
    var legend = h('div', 'rc-survey__legend'); legend.setAttribute('aria-live', 'off');
    function legendItem(cls) { var s = h('span', 'rc-survey__li ' + cls); s.appendChild(h('i')); var t = h('span'); s.appendChild(t); legend.appendChild(s); return { box: s, text: t }; }
    var lGood = legendItem('rc-survey__li--good'), lLittle = legendItem('rc-survey__li--little'), lFar = legendItem('rc-survey__li--far'), lUni = legendItem('rc-survey__li--uni');
    var lAvg = h('span', 'rc-survey__avg'); legend.appendChild(lAvg);

    /* transport: pause + the three parts */
    var nav = h('div', 'rc-survey__nav');
    var pauseBtn = h('button', 'rc-survey__pause'); pauseBtn.type = 'button';
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="rc-survey__ico-pause" d="M8 5v14M16 5v14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path class="rc-survey__ico-play" d="M8 5.2v13.6L19 12z" fill="currentColor"/></svg>';
    var pauseLabel = h('span', null, 'Pause'); pauseBtn.appendChild(pauseLabel);
    var tabsBox = h('div', 'rc-survey__tabs'); tabsBox.setAttribute('role', 'group'); tabsBox.setAttribute('aria-label', 'Part of the demo');
    var PHASES = ['meter', 'verdict', 'coda'], TAB_LABEL = { meter: 'Survey', verdict: 'Verdict', coda: 'Pitch raise' }, tabs = {}, bars = {};
    PHASES.forEach(function (p, i) {
      var b = h('button', 'rc-survey__tab'); b.type = 'button';
      b.appendChild(h('span', 'rc-survey__tabn', (i + 1) + '')); b.appendChild(h('span', null, TAB_LABEL[p]));
      var bar = h('i', 'rc-survey__bar'); b.appendChild(bar); bars[p] = bar;
      b.addEventListener('click', function () { gotoPhase(p); });
      tabs[p] = b; tabsBox.appendChild(b);
    });
    nav.appendChild(pauseBtn); nav.appendChild(tabsBox);

    [sw, stage, kb, dist, legend, nav].forEach(function (n) { root.appendChild(n); });
    el.appendChild(root);

    /* ----- state ----- */
    var pianos = {}; ORDER.forEach(function (id) { pianos[id] = buildPiano(id); });
    var piano = pianos.raise;
    var t = 0, active = false, paused = false, raf = 0, lastNow = 0, destroyed = false;
    var rmPhase = 'verdict';            // the static state shown under reduced motion
    var W = 0, dpr = 1, meterH = 0, kbH = 0, codaH = 0;
    var inspected = 0, viaKeys = false;
    var last = {};                      // what is currently painted, to avoid redundant DOM / canvas work
    var ariaAt = -1e9;

    function loopEnd() { return piano.sc.coda ? T_VERDICT + VERDICT_HOLD + CODA_LEN : T_VERDICT + VERDICT_HOLD_ALONE; }
    function phaseStart(p) { return p === 'meter' ? 0 : p === 'verdict' ? T_VERDICT : T_VERDICT + VERDICT_HOLD; }

    function stateAt(time) {
      var s = { phase: 'meter', n: 88, tc: 0, progress: 1 };
      if (env.reduceMotion) {
        s.phase = rmPhase === 'coda' && !piano.sc.coda ? 'verdict' : rmPhase; s.tc = CODA_LEN; s.needle = piano.d[88]; s.static = true;
        return s;
      }
      if (time < T_VERDICT) {
        var n = 0; while (n < 88 && KEY_T[n] <= time) n++;
        s.n = n; s.progress = time / T_VERDICT;
        if (n === 0) s.needle = 0;
        else {
          var prev = n > 1 ? piano.d[n - 1] : 0, p = clamp((time - KEY_T[n - 1]) / NEEDLE_S, 0, 1);
          s.needle = prev + (piano.d[n] - prev) * easeOut(p);
        }
      } else if (!piano.sc.coda || time < T_VERDICT + VERDICT_HOLD) {
        s.phase = 'verdict'; s.needle = piano.d[88];
        s.progress = (time - T_VERDICT) / (piano.sc.coda ? VERDICT_HOLD : VERDICT_HOLD_ALONE);
      } else {
        s.phase = 'coda'; s.needle = piano.d[88]; s.tc = time - T_VERDICT - VERDICT_HOLD; s.progress = s.tc / CODA_LEN;
      }
      return s;
    }

    /* coda choreography: rest → pull to the aim (1.5 s) → hold → slow settle toward the target */
    function codaAt(tc) {
      var c = piano.sc.coda, o = { step: 0, pos: c.now, moved: 0, settled: 0 };
      if (tc >= 1.4) { o.step = 1; o.moved = easeInOut(clamp((tc - 1.4) / 1.5, 0, 1)); o.pos = c.now + (c.aim - c.now) * o.moved; }
      if (tc >= 4.2) { o.step = 2; o.settled = easeInOut(clamp((tc - 4.2) / 3, 0, 1)); o.pos = c.aim + (c.settle - c.aim) * o.settled; }
      return o;
    }

    /* ----- drawing ----- */
    function fit(cv, cssH) {
      var bw = Math.max(1, Math.round(W * dpr)), bh = Math.max(1, Math.round(cssH * dpr));
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      cv.style.height = cssH + 'px';
      var ctx = cv.getContext('2d'); ctx.setTransform(bw / W, 0, 0, bh / cssH, 0, 0); ctx.clearRect(0, 0, W, cssH);
      return ctx;
    }

    function drawMeter(s) {
      var H = meterH, ctx = fit(meterCv, H);
      /* SurveyDial: pivot (W/2, 1.02H), radius min(0.95H, 0.96·W/2), sweep 110° for ±100¢, band 0.07·radius */
      var px = W / 2, py = H * 1.02, radius = Math.min(H * 0.95, W / 2 * 0.96), bandW = Math.max(6, radius * 0.07), q = clamp(radius / 266, 0.55, 1.1);
      function ang(c) { return (-90 + clamp(c, -100, 100) / 100 * 55) * Math.PI / 180; }
      function pt(c, rr) { var a = ang(c); return [px + rr * Math.cos(a), py + rr * Math.sin(a)]; }
      function zone(a, b, col) { ctx.beginPath(); ctx.arc(px, py, radius - bandW / 2, ang(a), ang(b)); ctx.strokeStyle = col; ctx.stroke(); }
      ctx.lineCap = 'butt'; ctx.lineWidth = bandW; ctx.globalAlpha = 0.45;
      zone(-100, -50, C.sharp); zone(-50, -15, C.warn); zone(-15, 15, SURVEY_GOOD); zone(15, 50, C.warn); zone(50, 100, C.sharp);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '500 ' + Math.max(10, radius * 0.06).toFixed(1) + 'px ' + uiFont;
      for (var i = -100; i <= 100; i += 10) {
        var major = i % 50 === 0, a = pt(i, radius - bandW - 2), b = pt(i, radius - bandW - (major ? bandW * 1.6 : bandW * 0.8));
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = major ? C.text : C.text2; ctx.lineWidth = (major ? 2.5 : 1.2) * q; ctx.stroke();
        if (major) { var lp = pt(i, radius - bandW * (Math.abs(i) === 100 ? 4.6 : 3.4)); ctx.fillStyle = C.text2; ctx.fillText(signed(i, 0), lp[0], lp[1]); }
      }
      ctx.font = '500 ' + Math.max(10, 13 * q).toFixed(1) + 'px ' + uiFont; ctx.fillStyle = C.text2;
      var fl = pt(-78, radius + bandW * 0.9), sh = pt(78, radius + bandW * 0.9);
      ctx.fillText('FLAT', fl[0], fl[1]); ctx.fillText('SHARP', sh[0], sh[1]);
      /* needle: grey at rest pointing to 0; zone-coloured; pinned with an outward arrow beyond ±100¢ */
      var has = s.n > 0, target = has ? piano.d[s.n] : 0, col = has ? zoneColour(target) : C.text2, shown = has ? s.needle : 0;
      var tipP = pt(shown, radius - 2);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tipP[0], tipP[1]);
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(2.5, radius * 0.018); ctx.lineCap = 'round'; ctx.stroke();
      if (has && Math.abs(shown) > 100) {
        var an = ang(shown), dir = shown > 0 ? 1 : -1, tx = -Math.sin(an) * dir, ty = Math.cos(an) * dir, nx = Math.cos(an), ny = Math.sin(an), sz = bandW * 1.4;
        var bx = tipP[0] + tx * sz * 0.3, by = tipP[1] + ty * sz * 0.3;
        ctx.beginPath(); ctx.moveTo(bx + tx * sz, by + ty * sz); ctx.lineTo(bx + nx * sz * 0.55, by + ny * sz * 0.55); ctx.lineTo(bx - nx * sz * 0.55, by - ny * sz * 0.55); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
      }
    }

    function keyRect(k) {   // KeyboardView: white W/52; black 0.6w × 0.62H centred on the boundary
      var ww = W / 52, key = KEYS[k];
      return key.black ? [key.wi * ww - ww * 0.3, 0, ww * 0.6, kbH * 0.62] : [key.wi * ww, 0, ww, kbH];
    }
    function rr(ctx, x, y, w, hh, r) {
      r = Math.min(r, w / 2, hh / 2);
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function drawKeyboard(s) {
      var ctx = fit(kbCv, kbH), ww = W / 52, rad = ww >= 9 ? 2 : 1.2, pass, k;
      var expected = s.phase === 'meter' && s.n < 88 && !s.static ? s.n + 1 : 0;
      for (pass = 0; pass < 2; pass++) for (k = 1; k <= 88; k++) {
        var key = KEYS[k]; if (key.black !== (pass === 1)) continue;
        var r = keyRect(k), x = r[0] + 0.5, y = 0.5, w = r[2] - 1, hh = r[3] - 1;
        rr(ctx, x, y, w, hh, rad); ctx.fillStyle = key.black ? C.black : C.white; ctx.fill();
        if (k <= s.n) { ctx.globalAlpha = key.black ? 0.9 : 0.8; ctx.fillStyle = ramp(piano.d[k]); ctx.fill(); ctx.globalAlpha = 1; }   // SurveyPalette tint
        ctx.strokeStyle = C.bg; ctx.lineWidth = 1; ctx.stroke();
        var uni = k <= s.n && piano.sc.unisons[k];
        if (uni) {   // keyMark bar: strings disagree (red ≥ 10¢ apart, amber below)
          var mw = Math.max(3, r[2] * 0.62), mh = Math.max(2.5, r[3] * 0.035), mx = r[0] + r[2] / 2 - mw / 2, my = r[3] - mh - (key.black ? 5 : 7);
          rr(ctx, mx - 0.5, my - 0.5, mw + 1, mh + 1, mh); ctx.fillStyle = 'rgba(15,17,21,0.55)'; ctx.fill();
          rr(ctx, mx, my, mw, mh, mh); ctx.fillStyle = uni.spread >= 10 ? C.sharp : C.warn; ctx.fill();
        }
        if (k === inspected) { rr(ctx, x, y, w, hh, rad); ctx.globalAlpha = 0.2; ctx.fillStyle = C.accent; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke(); }
        else if (k === expected) { rr(ctx, x + 0.5, y + 0.5, w - 1, hh - 1, rad); ctx.strokeStyle = C.text; ctx.lineWidth = Math.min(3, Math.max(1.5, ww * 0.25)); ctx.stroke(); }
      }
      if (ww >= 10) {   // labels A0 · C4 · C8 (keyboardLabel 10 medium, blackKey colour)
        ctx.font = '500 10px ' + uiFont; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.black;
        [1, 40, 88].forEach(function (lk) { var r2 = keyRect(lk), half = ctx.measureText(KEYS[lk].name).width / 2 + 1.5; ctx.fillText(KEYS[lk].name, clamp(r2[0] + r2[2] / 2, half, W - half), kbH - 9); });
      }
    }

    function drawCoda(s) {
      var c = piano.sc.coda; if (!c) return;
      var H = codaH, ctx = fit(codaCv, H), q = clamp(W / 600, 0.62, 1), st = codaAt(s.tc);
      var padL = 22 * q + 6, padR = 22 * q + 6, axisY = Math.round(H * 0.62) + 0.5, top = 8;
      function X(v) { return padL + (v - c.lo) / (c.hi - c.lo) * (W - padL - padR); }
      var small = Math.max(10, 11 * q).toFixed(1), fLabel = '600 ' + small + 'px ' + uiFont, fTick = '500 ' + Math.max(9.5, 10.5 * q).toFixed(1) + 'px ' + uiFont;
      ctx.textBaseline = 'middle';
      /* the overpull span, final → aim */
      if (c.overpull) { ctx.fillStyle = C.reference; ctx.globalAlpha = 0.13; ctx.fillRect(X(0), top + 16, X(c.aim) - X(0), axisY - top - 16); ctx.globalAlpha = 1; }
      /* axis + ticks */
      ctx.strokeStyle = C.text2; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(padL - 8, axisY); ctx.lineTo(W - padR + 8, axisY); ctx.stroke(); ctx.globalAlpha = 1;
      var labelEvery = (c.hi - c.lo) / c.step > 7 && W < 440 ? c.step * 2 : c.step;
      ctx.font = fTick; ctx.textAlign = 'center';
      for (var v = c.lo; v <= c.hi; v += c.step / 2) {
        var whole = (v - c.lo) % c.step === 0;
        ctx.beginPath(); ctx.moveTo(X(v), axisY); ctx.lineTo(X(v), axisY + (whole ? 7 : 4)); ctx.strokeStyle = C.text2; ctx.globalAlpha = whole ? 0.9 : 0.5; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1;
        if (whole && (v - c.lo) % labelEvery === 0) { ctx.fillStyle = C.text2; ctx.fillText(signed(v, 0), X(v), axisY + 18); }
      }
      ctx.fillStyle = C.text2; ctx.textAlign = 'left'; ctx.fillText('FLAT', padL - 8, H - 9); ctx.textAlign = 'right'; ctx.fillText('SHARP', W - padR + 8, H - 9);
      ctx.textAlign = 'center'; ctx.globalAlpha = 0.8; ctx.fillText('cents from the final target', W / 2, H - 9); ctx.globalAlpha = 1;
      /* final target: the grey tick the app labels "final" */
      ctx.strokeStyle = C.text2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(0), top + 16); ctx.lineTo(X(0), axisY + 7); ctx.stroke();
      ctx.font = fLabel; ctx.fillStyle = C.text2;
      if (c.overpull) {
        ctx.textAlign = 'right'; ctx.fillText('final', X(0) - 6, top + 7);
        ctx.strokeStyle = C.reference; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X(c.aim), top + 16); ctx.lineTo(X(c.aim), axisY + 7); ctx.stroke();
        var aimText = 'aim ' + cents(c.aim, 1);
        ctx.fillStyle = C.reference; ctx.textAlign = 'left'; ctx.fillText(aimText, Math.min(X(c.aim) + 6, W - ctx.measureText(aimText).width - 2), top + 7);
      } else { ctx.textAlign = 'center'; var af = 'aim = final'; ctx.fillText(af, Math.min(X(0), W - ctx.measureText(af).width / 2 - 2), top + 7); }
      /* where it was, the path, where it is */
      var rad = 7 * q + 1, x0 = X(c.now), xs = X(st.pos);
      ctx.strokeStyle = C.text; ctx.globalAlpha = 0.4; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
      if (st.step >= 1) { ctx.beginPath(); ctx.moveTo(x0 + rad, axisY); ctx.lineTo(Math.max(x0 + rad, (st.step === 2 ? X(c.aim) : xs) - rad), axisY); ctx.stroke(); }
      ctx.setLineDash([]);
      if (st.step >= 1) { ctx.beginPath(); ctx.arc(x0, axisY, rad - 1, 0, 6.2832); ctx.stroke(); }
      ctx.globalAlpha = 1;
      if (st.step === 2 && c.overpull) { ctx.strokeStyle = C.reference; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(X(c.aim), axisY, rad - 1, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1; }
      if (st.step === 2 && st.settled > 0.02) {   // an estimate, so a soft region rather than a point
        var g = ctx.createRadialGradient(X(c.settle), axisY, 0, X(c.settle), axisY, rad * 3.2);
        g.addColorStop(0, 'rgba(232,234,240,' + (0.22 * st.settled).toFixed(3) + ')'); g.addColorStop(1, 'rgba(232,234,240,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(c.settle), axisY, rad * 3.2, 0, 6.2832); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(xs, axisY, rad, 0, 6.2832); ctx.fillStyle = C.text; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.bg; ctx.stroke();
      /* label over the string marker */
      var label = st.step === 0 ? 'now ' + cents(c.now) : st.step === 1 ? cents(st.pos) : st.settled > 0.98 ? 'settles about here' : 'settling';
      ctx.font = fLabel; ctx.fillStyle = C.text; ctx.textAlign = 'center';
      var half = ctx.measureText(label).width / 2 + 4, lx = clamp(xs, half, W - half);
      ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = C.surface; ctx.strokeText(label, lx, axisY - rad - 11);   // keeps it legible across the marker lines
      ctx.fillText(label, lx, axisY - rad - 11);
      var wasA = clamp((Math.abs(xs - x0) - 64) / 36, 0, 1);   // appears once the marker has cleared it
      if (st.step >= 1 && wasA > 0) { ctx.globalAlpha = wasA; ctx.fillStyle = C.text2; ctx.font = fTick; ctx.fillText('was ' + cents(c.now), clamp(x0, 30, W - 30), axisY - rad - 11); ctx.globalAlpha = 1; }
    }

    /* ----- painting (DOM only when something changed) ----- */
    function setText(node, key, value) { if (last[key] !== value) { last[key] = value; node.textContent = value; } }

    function paintScenario() {
      var sc = piano.sc, c = sc.coda;
      ORDER.forEach(function (id) { segs[id].setAttribute('aria-pressed', id === piano.id ? 'true' : 'false'); });
      vHead.textContent = sc.headline; vRec.textContent = sc.rec(piano);
      vWarn.hidden = !sc.warning; vExplain.hidden = !sc.explain;
      tabs.coda.disabled = !c;
      tabs.coda.title = c ? '' : 'No pitch raise is needed for this piano';
      if (c) {
        cBadgeText.textContent = c.badge; cBadge.classList.toggle('rc-survey__badge--grey', !c.overpull);
        cChip.hidden = !c.chip; cChipText.textContent = c.chip || '';
        cStat.forEach(function (n, i) { n.textContent = c.status[i]; });
        cNums.innerHTML = 'Target<sup>PR</sup> ' + c.numbers[0] + ' · final ' + c.numbers[1] + ' · Φ ' + c.numbers[2] + ' · <span class="rc-survey__bar-phi">Φ</span> ' + c.numbers[3];
        cCaption.textContent = c.caption;
      }
      last = {};
    }

    function paintInspector() {
      var s = stateAt(t), k = inspected;
      if (!k) {
        tip.classList.remove('is-on'); kb.removeAttribute('aria-valuenow'); kb.setAttribute('aria-valuetext', 'No key selected');
        insp.classList.remove('has-key'); iHint.textContent = 'Hover or tap a key below to see its result.';
        return;
      }
      var read = k <= s.n, d = piano.d[k], uni = read && piano.sc.unisons[k], name = KEYS[k].name, txt;
      if (read) {
        txt = name + ' · ' + cents(d) + ' · ' + pitchWord(d);
        if (uni) txt += ' · strings ' + uni.spread + '¢ apart';
        tipDot.style.background = ramp(d); tipDot.hidden = false;
      } else { txt = name + ' · not read'; tipDot.hidden = true; }
      tipText.textContent = txt;
      tip.classList.add('is-on');
      var r = keyRect(k), mid = r[0] + r[2] / 2, half = tip.offsetWidth / 2;   // event-time measurement, never per frame
      tip.style.transform = 'translate(' + Math.round(clamp(mid - half, 0, Math.max(0, W - half * 2))) + 'px, 0)';
      kb.setAttribute('aria-valuenow', k);
      kb.setAttribute('aria-valuetext', read ? name + ', ' + spoken(d) + ', ' + pitchWord(d) + (uni ? ', strings ' + uni.spread + ' cents apart, ' + uni.beat.toFixed(1) + ' beats a second' : '') : name + ', not read');
      insp.classList.add('has-key'); iNote.textContent = name;
      iCents.textContent = read ? cents(d) : ''; iCents.style.color = read ? ramp(d) : '';
      iWord.textContent = read ? pitchWord(d) : 'not read'; iWord.style.color = read ? ramp(d) : '';
      iUni.textContent = uni ? 'strings ' + uni.spread + '¢ apart · ' + uni.beat.toFixed(1) + ' beats/s' : '';
      iUni.classList.toggle('is-red', !!uni && uni.spread >= 10);
      iHint.textContent = '';
    }

    function paint(force) {
      if (!W) return;
      var s = stateAt(t), sc = piano.sc, n = s.n;
      if (force) last = {};
      /* views */
      if (last.phase !== s.phase) {
        last.phase = s.phase;
        [['meter', vMeter], ['verdict', vVerdict], ['coda', vCoda]].forEach(function (p) {
          var on = p[0] === s.phase; p[1].classList.toggle('is-on', on);
          if (on) p[1].removeAttribute('aria-hidden'); else p[1].setAttribute('aria-hidden', 'true');
        });
        PHASES.forEach(function (p) { if (p === s.phase) tabs[p].setAttribute('aria-current', 'step'); else tabs[p].removeAttribute('aria-current'); });
        root.classList.toggle('is-verdict', s.phase === 'verdict');   // the card's own inspector row replaces the tooltip
        ariaAt = -1e9;
      }
      /* progress bars under the three parts (compositor-only transform) */
      PHASES.forEach(function (p, i) {
        var idx = PHASES.indexOf(s.phase), v = s.static ? (i === idx ? 1 : 0) : i < idx ? 1 : i === idx ? clamp(s.progress, 0, 1) : 0, key = 'bar' + p, str = v.toFixed(3);
        if (last[key] !== str) { last[key] = str; bars[p].style.transform = 'scaleX(' + str + ')'; }
      });
      /* readout */
      var has = n > 0, shownKey = has ? n : 1, d = has ? piano.d[n] : null;
      setText(rNote, 'note', KEYS[shownKey].name);
      setText(rCents, 'cents', has ? cents(d) : '—');
      setText(rWord, 'word', has ? (d === 0 ? 'IN TUNE' : d < 0 ? 'FLAT' : 'SHARP') : '');
      setText(rCap, 'cap', has ? 'recorded' : 'Play ' + KEYS[1].name);
      var col = has ? zoneColour(d) : C.text2;
      if (last.col !== col) { last.col = col; rCents.style.color = col; rWord.style.color = col; }
      /* legend + distribution */
      if (last.n !== n || last.pid !== piano.id) {
        var run = piano.run[n];
        lGood.text.textContent = run[0] + ' in tune'; lLittle.text.textContent = run[1] + ' a little off'; lFar.text.textContent = run[2] + ' far off';
        lUni.box.hidden = run[3] === 0; lUni.text.textContent = run[3] === 1 ? '1 unison disagrees' : run[3] + ' strings disagree';
        lAvg.textContent = n ? 'average ' + cents(run[4] / n) : 'average —';
        dGood.style.flexGrow = run[0]; dLittle.style.flexGrow = run[1]; dFar.style.flexGrow = run[2];
        dGood.hidden = !run[0]; dLittle.hidden = !run[1]; dFar.hidden = !run[2];
        vCount.textContent = n + ' of 88 keys';
      }
      /* canvases */
      var mk = n + '|' + (s.needle || 0).toFixed(2) + '|' + W + '|' + dpr;
      if (s.phase === 'meter' && last.meter !== mk) { last.meter = mk; drawMeter(s); }
      var kk = n + '|' + inspected + '|' + s.phase + '|' + W + '|' + dpr;
      if (last.kbd !== kk) { last.kbd = kk; drawKeyboard(s); }
      if (s.phase === 'coda' && sc.coda) {
        var st = codaAt(s.tc), ck = st.step + '|' + st.pos.toFixed(2) + '|' + st.settled.toFixed(3) + '|' + W + '|' + dpr;
        if (last.coda !== ck) { last.coda = ck; drawCoda(s); }
        if (last.cstep !== st.step) { last.cstep = st.step; cStat.forEach(function (node, i) { node.classList.toggle('is-on', i === st.step); }); }
      }
      var inspKey = inspected ? inspected + (inspected <= n ? 'r' : 'u') + piano.id : '';
      if (last.insp !== inspKey) { last.insp = inspKey; if (inspected) paintInspector(); }   // only when the inspected key's state flips
      last.n = n; last.pid = piano.id;
      /* accessible names, throttled to once a second */
      var now = performance.now();
      if (now - ariaAt > 1000) {
        ariaAt = now;
        var ml = 'Survey meter, a dial from 100 cents flat to 100 cents sharp. ' + (has ? KEYS[n].name + ' recorded at ' + spoken(d) + ', ' + pitchWord(d) + '. ' + n + ' of 88 keys read.' : 'Waiting for ' + KEYS[1].name + '.');
        if (last.ml !== ml) { last.ml = ml; meterCv.setAttribute('aria-label', ml); }
        if (sc.coda && last.cl !== sc.coda.aria) { last.cl = sc.coda.aria; codaCv.setAttribute('aria-label', sc.coda.aria); }
      }
    }

    /* ----- clock ----- */
    function frame(now) {
      raf = 0; if (!active || destroyed) return;
      var dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
      if (!paused && !env.reduceMotion) { t += dt; if (t >= loopEnd()) t = 0; }
      paint(false);
      if (!env.reduceMotion && !paused) raf = requestAnimationFrame(frame);
    }
    function kick() { if (active && !raf && !paused && !env.reduceMotion && !destroyed) { lastNow = performance.now(); raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    function setScenario(id) {
      if (!pianos[id]) return;
      piano = pianos[id]; t = 0;
      if (env.reduceMotion && rmPhase === 'coda' && !piano.sc.coda) rmPhase = 'verdict';
      paintScenario(); paint(true); paintInspector(); kick();
    }
    function gotoPhase(p) {
      if (p === 'coda' && !piano.sc.coda) return;
      rmPhase = p; t = phaseStart(p); paint(true); paintInspector(); kick();
    }
    function setPaused(on) {
      paused = on; pauseBtn.classList.toggle('is-paused', on); pauseLabel.textContent = on ? 'Play' : 'Pause';
      pauseBtn.setAttribute('aria-label', on ? 'Play the demo' : 'Pause the demo');
      if (on) stop(); else kick();
    }
    pauseBtn.addEventListener('click', function () { setPaused(!paused); });

    /* ----- keyboard map interaction ----- */
    function hit(ev) {
      var b = kbCv.getBoundingClientRect(), x = (ev.clientX - b.left) * (W / b.width), y = (ev.clientY - b.top) * (kbH / b.height), ww = W / 52, k;
      if (y < kbH * 0.62) for (k = 1; k <= 88; k++) if (KEYS[k].black) { var r = keyRect(k); if (x >= r[0] && x <= r[0] + r[2]) return k; }
      var wi = clamp(Math.floor(x / ww), 0, 51);
      for (k = 1; k <= 88; k++) if (!KEYS[k].black && KEYS[k].wi === wi) return k;
      return 0;
    }
    function inspect(k) { if (k === inspected) return; inspected = k; paintInspector(); paint(false); }
    kb.addEventListener('pointermove', function (ev) { viaKeys = false; inspect(hit(ev)); });
    kb.addEventListener('pointerdown', function (ev) { viaKeys = false; inspect(hit(ev)); });
    kb.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse' && !viaKeys) inspect(0); });
    kb.addEventListener('focus', function () { if (kb.matches(':focus-visible') && !inspected) { viaKeys = true; inspect(40); } });
    kb.addEventListener('blur', function () { viaKeys = false; inspect(0); });
    kb.addEventListener('keydown', function (ev) {
      var k = inspected || 40, n = k;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') n = k + 1; else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') n = k - 1;
      else if (ev.key === 'PageUp') n = k + 12; else if (ev.key === 'PageDown') n = k - 12; else if (ev.key === 'Home') n = 1; else if (ev.key === 'End') n = 88;
      else if (ev.key === 'Escape') { inspect(0); return; } else return;
      ev.preventDefault(); viaKeys = true; inspect(clamp(n, 1, 88));
    });

    /* ----- size ----- */
    function resize(width) {
      var nd = Math.min(2, window.devicePixelRatio || 1);
      if (!width || (Math.abs(width - W) < 0.5 && nd === dpr)) return;
      W = width; dpr = nd;
      meterH = Math.round(W * 280 / 640);              // SurveyMeterView dialAspect 640:280
      kbH = Math.round(Math.max(W / 9, 46));           // keyboardAspect 9:1, kept tall enough to touch on phones
      codaH = Math.round(clamp(W * 0.25, 124, 156));
      meterCv.style.height = meterH + 'px'; kbCv.style.height = kbH + 'px'; codaCv.style.height = codaH + 'px';   // before any drawing, so the stage never jumps
      root.style.setProperty('--u', clamp(W / 640, 0.45, 1.05).toFixed(4));
      paint(true); if (inspected) paintInspector();
    }
    var ro = null;
    if ('ResizeObserver' in window) { ro = new ResizeObserver(function (en) { resize(en[0].contentRect.width); }); ro.observe(root); }
    else { resize(root.clientWidth); window.addEventListener('resize', onWinResize); }
    function onWinResize() { resize(root.clientWidth); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!destroyed) paint(true); });

    env.onReduceMotionChange && env.onReduceMotionChange(function (rm) {
      if (destroyed) return;
      root.classList.toggle('is-static', !!rm);
      if (rm) { stop(); rmPhase = t < T_VERDICT ? 'meter' : (!piano.sc.coda || t < T_VERDICT + VERDICT_HOLD) ? 'verdict' : 'coda'; } else t = phaseStart(rmPhase);
      paint(true); paintInspector(); kick();
    });

    root.classList.toggle('is-static', !!env.reduceMotion);
    paintScenario(); setPaused(false); paintInspector(); resize(root.clientWidth);

    return {
      setActive: function (on) { active = !!on; if (active) { paint(false); kick(); } else stop(); },
      destroy: function () { destroyed = true; stop(); if (ro) ro.disconnect(); window.removeEventListener('resize', onWinResize); el.textContent = ''; },
      /* dev harness hooks */
      seek: function (sec) { t = clamp(sec, 0, loopEnd() - 0.001); paint(true); },
      scenario: setScenario, phase: gotoPhase, inspect: inspect, pause: setPaused
    };
  }

  mount.buildPiano = buildPiano;
  window.ResonanceComponents = window.ResonanceComponents || {};
  window.ResonanceComponents.survey = mount;
})();
