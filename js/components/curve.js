/* curve.js — live recreation of the Curve view's two per-key charts (App/Views/Measure/CurveCharts.swift,
   CurveView.swift). Data: research/measure-views.md §8.2 (the app's prior-only curve) and §8.3 (data set B,
   a SYNTHETIC grand after 14 wizard measurements, from a verified replica of the app's solver).
   The states between "prior" and "14 measured" are a visual interpolation, not solver output. */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- data */

  // §8.2 — prior only (Standard, equal, A4 = 440): x_k and Risk(k), k = 1…88.
  var PRIOR_X = [-16.70, -16.07, -15.50, -14.97, -14.43, -13.90, -13.45, -13.10, -12.68, -12.22, -11.76, -11.22,
    -10.24, -9.75, -9.34, -8.95, -8.55, -8.17, -7.84, -7.58, -7.29, -6.96, -6.64, -6.29,
    -6.09, -5.76, -5.46, -5.18, -4.88, -4.61, -4.38, -4.20, -4.00, -3.74, -3.49, -3.23,
    -3.00, -2.73, -2.46, -2.21, -1.93, -1.67, -1.45, -1.26, -1.06, -0.77, -0.52, -0.25,
    0.00, 0.29, 0.59, 0.87, 1.18, 1.47, 1.74, 1.97, 2.21, 2.58, 2.87, 3.20,
    3.55, 3.93, 4.35, 4.75, 5.22, 5.66, 6.10, 6.53, 6.94, 7.69, 8.18, 8.77,
    9.42, 10.12, 10.86, 11.62, 12.35, 13.23, 14.17, 15.16, 16.07, 16.37, 17.59, 19.14,
    20.85, 22.73, 24.80, 27.02];
  var PRIOR_RISK = [5.30, 4.10, 3.81, 3.70, 3.63, 3.59, 3.53, 3.31, 3.22, 3.14, 3.07, 3.09, 3.18, 2.72, 2.54, 2.46, 2.42, 2.40, 2.36, 2.30,
    2.24, 2.19, 2.16, 2.22, 2.64, 2.11, 1.98, 1.94, 1.95, 1.97, 1.97, 1.97, 1.96, 1.95, 1.96, 2.04, 3.07, 2.07, 2.00, 1.99,
    2.02, 2.08, 2.11, 2.17, 2.19, 2.21, 2.29, 2.13, 3.83, 2.24, 2.52, 2.46, 2.55, 2.67, 2.77, 2.89, 3.00, 3.07, 3.23, 3.17,
    3.75, 3.49, 3.86, 4.99, 4.17, 4.42, 4.75, 5.09, 5.50, 3.33, 3.56, 3.63, 3.69, 4.20, 4.11, 6.11, 3.26, 3.54, 3.90, 4.37,
    4.63, 0, 0, 0, 0, 0, 0, 0];
  var PRIOR_SIGMA = 0.300;
  // SPEC §2 / AnalysisSettings.swift:183-186
  function priorLog10B(k) { var d = k - 40; return -3.4 + 0.02 * d + 0.00035 * d * d; }

  // §8.3 — data set B (synthetic), verbatim.
  var FINAL_X = [-20.27, -18.42, -16.74, -15.25, -13.89, -12.66, -11.71, -11.29, -10.92, -10.25, -9.56, -8.67,
    -7.22, -6.66, -6.29, -5.93, -5.57, -5.22, -4.99, -5.13, -6.48, -6.57, -6.28, -5.92,
    -5.72, -5.45, -5.28, -5.10, -4.91, -4.73, -4.64, -4.64, -3.89, -3.65, -3.44, -3.13,
    -2.87, -2.62, -2.42, -2.14, -2.02, -1.83, -1.71, -1.60, -1.11, -0.83, -0.57, -0.28,
    0.00, 0.26, 0.48, 0.75, 0.94, 1.14, 1.30, 1.47, 1.89, 2.24, 2.51, 2.82,
    3.14, 3.45, 3.73, 4.05, 4.36, 4.68, 4.96, 5.27, 5.79, 6.47, 6.81, 7.32,
    7.88, 8.45, 8.97, 9.39, 10.18, 10.95, 11.71, 12.56, 13.42, 14.01, 15.28, 16.71,
    18.27, 19.98, 21.75, 23.49];
  var FINAL_RISK = [0.32, 0.71, 0.60, 0.53, 0.47, 0.43, 0.39, 0.34, 0.30, 0.09, 0.25, 0.23, 0.22, 0.18, 0.16, 0.14, 0.13, 0.13, 0.12, 0.05,
    0.12, 0.22, 0.22, 0.23, 0.27, 0.22, 0.21, 0.09, 0.20, 0.21, 0.21, 0.21, 0.21, 0.08, 0.21, 0.22, 0.32, 0.22, 0.21, 0.11,
    0.21, 0.21, 0.22, 0.22, 0.22, 0.07, 0.23, 0.21, 0.38, 0.22, 0.25, 0.12, 0.25, 0.26, 0.27, 0.28, 0.29, 0.10, 0.31, 0.31,
    0.37, 0.34, 0.38, 0.15, 0.41, 0.44, 0.48, 0.51, 0.56, 0.11, 0.36, 0.37, 0.38, 0.44, 0.43, 0.23, 0.34, 0.37, 0.41, 0.46,
    0.25, 0, 0, 0, 0, 0, 0, 0];
  var FINAL_B = [3.756e-4, 3.390e-4, 3.037e-4, 2.732e-4, 2.468e-4, 2.239e-4, 2.041e-4, 1.868e-4, 1.717e-4, 1.547e-4, 1.470e-4, 1.368e-4,
    1.280e-4, 1.202e-4, 1.134e-4, 1.075e-4, 1.023e-4, 9.773e-5, 9.381e-5, 9.139e-5, 1.921e-4, 2.023e-4, 2.072e-4, 2.124e-4,
    2.181e-4, 2.243e-4, 2.308e-4, 2.384e-4, 2.453e-4, 2.532e-4, 2.616e-4, 2.705e-4, 2.800e-4, 2.873e-4, 3.007e-4, 3.119e-4,
    3.239e-4, 3.367e-4, 3.503e-4, 3.539e-4, 3.805e-4, 3.972e-4, 4.153e-4, 4.347e-4, 4.558e-4, 4.789e-4, 5.035e-4, 5.306e-4,
    5.602e-4, 5.927e-4, 6.284e-4, 6.466e-4, 7.109e-4, 7.588e-4, 8.118e-4, 8.705e-4, 9.357e-4, 1.004e-3, 1.089e-3, 1.179e-3,
    1.279e-3, 1.392e-3, 1.517e-3, 1.609e-3, 1.814e-3, 1.990e-3, 2.188e-3, 2.409e-3, 2.657e-3, 2.853e-3, 3.247e-3, 3.598e-3,
    3.992e-3, 4.434e-3, 4.931e-3, 5.460e-3, 6.116e-3, 6.821e-3, 7.615e-3, 8.508e-3, 9.731e-3, 1.065e-2, 1.193e-2, 1.337e-2,
    1.500e-2, 1.684e-2, 1.894e-2, 2.131e-2];
  var MEASURED_SIGMA = { 1: 0.011, 10: 0.012, 20: 0.015, 21: 0.018, 28: 0.015, 34: 0.013, 40: 0.018, 46: 0.010, 52: 0.017, 58: 0.012, 64: 0.011, 70: 0.011, 76: 0.012, 81: 0.017 };
  var TOP_SIGMA = [0.084, 0.134, 0.184, 0.234, 0.284, 0.334, 0.389]; // keys 82…88
  // Synthetic wizard confidences (C4 = 0.93 as in the research's hover-row example).
  var CONF = { 1: 0.91, 10: 0.90, 20: 0.89, 21: 0.92, 28: 0.94, 34: 0.95, 40: 0.93, 46: 0.95, 52: 0.94, 58: 0.93, 64: 0.92, 70: 0.90, 76: 0.88, 81: 0.87 };
  // Arrival order: the 8 seeds (A0, last wound, first plain, C3…C7), then the six further picks. F#1 comes last so
  // the sparsely measured bass keeps the illustrative max-Risk above 1.0¢ until the final, solver-backed state.
  var ORDER = [1, 20, 21, 28, 40, 52, 64, 76, 70, 81, 58, 34, 46, 10];
  var K_PLAIN = 21; // default grand layout: break at F2, "break guess"
  // Illustrative max-Risk after n measurements for the interpolated states (index = n). Only n = 0 (6.11, §8.2)
  // and n = 14 (0.71, §8.3) are solver output; the rest keep the badge inside the level the app's copy promises
  // ("8 seeds give a usable curve", CurveRecords.swift:15).
  var RISK_TARGET = [6.11, 5.7, 5.3, 4.9, 4.5, 4.0, 3.5, 3.0, 1.4, 1.35, 1.3, 1.25, 1.2, 1.15, 0.71];

  var N = 88, STEPS = ORDER.length;
  var NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
  var TICK_KEYS = [1, 4, 16, 28, 40, 52, 64, 76, 88]; // CurveCharts.swift:6

  function keyName(k) { return NAMES[(k - 1) % 12] + Math.floor((k + 8) / 12); }
  function isBlack(k) { var pc = (k - 1) % 12; return pc === 1 || pc === 4 || pc === 6 || pc === 9 || pc === 11; }
  function nStar(k) { return k <= 15 ? 6 : k <= 39 ? 4 : k <= 63 ? 2 : 1; }
  function fT(k) { return 440 * Math.pow(2, (k - 49) / 12); }

  /* Theme.Format: typographic minus, explicit plus, unsigned zero. */
  function signed(v, d) {
    var m = Math.abs(v).toFixed(d);
    if (Number(m) === 0) return m;
    return (v < 0 ? '−' : '+') + m;
  }
  function fmtB(b) { return b.toExponential(1); } // "3.5e-4" (LogLine.sci, 2 significant)

  /* ------------------------------------------------ interpolated story states */

  function buildStates() {
    var finalLB = FINAL_B.map(function (b) { return Math.log(b) / Math.LN10; });
    var finalS = [];
    var i, k, n;
    for (k = 1; k <= N; k++) finalS.push(MEASURED_SIGMA[k] || (k <= 81 ? 0.034 : TOP_SIGMA[k - 82]));
    var states = [], g = 0;
    for (n = 0; n <= STEPS; n++) {
      // Local settling around each measured key (same string section only), plus a global weight g
      // chosen so the largest band half-width equals RISK_TARGET[n].
      var L = new Float64Array(N);
      for (k = 1; k <= N; k++) {
        var s = 0;
        for (i = 0; i < n; i++) {
          var m = ORDER[i];
          if ((m < K_PLAIN) !== (k < K_PLAIN)) continue;
          var d = (k - m) / 5; s += Math.exp(-d * d);
        }
        L[k - 1] = Math.min(1, s);
      }
      if (n === 0) g = 0;
      else if (n === STEPS) g = 1;
      else {
        var lo = g, hi = 1;
        for (var it = 0; it < 40; it++) {
          var mid = (lo + hi) / 2, mx = 0;
          for (k = 0; k < N; k++) { var u0 = mid + (1 - mid) * L[k]; mx = Math.max(mx, PRIOR_RISK[k] + (FINAL_RISK[k] - PRIOR_RISK[k]) * u0); }
          if (mx > RISK_TARGET[n]) lo = mid; else hi = mid;
        }
        g = hi;
      }
      var st = { x: new Float64Array(N), risk: new Float64Array(N), lb: new Float64Array(N), sigma: new Float64Array(N), maxRisk: 0, maxKey: 1 };
      for (k = 0; k < N; k++) {
        var u = g + (1 - g) * L[k];
        st.x[k] = PRIOR_X[k] + (FINAL_X[k] - PRIOR_X[k]) * u;
        st.risk[k] = PRIOR_RISK[k] + (FINAL_RISK[k] - PRIOR_RISK[k]) * u;
        st.lb[k] = priorLog10B(k + 1) + (finalLB[k] - priorLog10B(k + 1)) * u;
        st.sigma[k] = PRIOR_SIGMA + (finalS[k] - PRIOR_SIGMA) * u;
        if (st.risk[k] > st.maxRisk) { st.maxRisk = st.risk[k]; st.maxKey = k + 1; }
      }
      states.push(st);
    }
    return states;
  }

  /* Monotone cubic through (xs, ys) — the d3 curveMonotoneX construction, as Swift Charts' .monotone. */
  function sign(v) { return v < 0 ? -1 : 1; }
  function tracePath(ctx, xs, ys, n, tan, move) {
    var i, h0, h1, s0, s1, p;
    for (i = 1; i < n - 1; i++) {
      h0 = xs[i] - xs[i - 1]; h1 = xs[i + 1] - xs[i];
      s0 = (ys[i] - ys[i - 1]) / h0; s1 = (ys[i + 1] - ys[i]) / h1;
      p = (s0 * h1 + s1 * h0) / (h0 + h1);
      tan[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
    }
    tan[0] = (3 * (ys[1] - ys[0]) / (xs[1] - xs[0]) - tan[1]) / 2;
    tan[n - 1] = (3 * (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]) - tan[n - 2]) / 2;
    if (move) ctx.moveTo(xs[0], ys[0]); else ctx.lineTo(xs[0], ys[0]);
    for (i = 1; i < n; i++) {
      var dx = (xs[i] - xs[i - 1]) / 3;
      ctx.bezierCurveTo(xs[i - 1] + dx, ys[i - 1] + dx * tan[i - 1], xs[i] - dx, ys[i] - dx * tan[i], xs[i], ys[i]);
    }
  }

  function easeInOut(p) { return p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
  function easeOut(p) { return p <= 0 ? 0 : p >= 1 ? 1 : 1 - (1 - p) * (1 - p); }

  function h(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }

  /* Story timing (seconds). */
  var LEAD = 1.5, STEP = 0.85, MORPH = 0.5, TAIL = 0.5;
  var END = LEAD + (STEPS - 1) * STEP + MORPH + TAIL;
  /* Plot insets inside each canvas (CSS px). The y axis sits on the trailing side, as Swift Charts draws it. */
  var PL = 10, PR = 40, PT = 16, PB = 18;
  var Y_MIN = -26, Y_MAX = 30;          // cents: holds the prior's band and both end points
  var LB_MIN = -5, LB_MAX = -1.2;       // log10 B: the app's 1e-5 … 1e-2 marks, head-room for the ±σ flare

  var ICON_REPLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5a7 7 0 1 1-6.7 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 1.6v6.8L7.6 5z" fill="currentColor"/></svg>';
  var ICON_SKIP = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5.5v13l9-6.5z" fill="currentColor"/><path d="M17.5 5.5v13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  var ICON_SWAP = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 8h14m0 0-4-4m4 4-4 4M20 16H6m0 0 4-4m-4 4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  window.ResonanceComponents = window.ResonanceComponents || {};
  window.ResonanceComponents.curve = function mount(el, env) {
    var T = env.tokens, F = env.fonts;
    var states = buildStates();
    var fallback = el.querySelector('.rc-fallback');
    if (fallback) fallback.remove();

    /* ------------------------------------------------------------ DOM */
    var root = h('div', 'rc-curve__root');
    var head = h('div', 'rc-curve__head');
    var sub = h('p', 'rc-curve__sub');
    var badges = h('div', 'rc-curve__badges');
    var badge = h('span', 'rc-curve__badge');
    var riskBadge = h('span', 'rc-curve__badge rc-curve__badge--grey');
    var btn = h('button', 'rc-curve__btn'); btn.type = 'button';
    badges.appendChild(badge); badges.appendChild(riskBadge);
    head.appendChild(sub); head.appendChild(btn); head.appendChild(badges);

    var stage = h('div', 'rc-curve__stage');
    function card(title, subtitle) {
      var c = h('div', 'rc-curve__card');
      c.appendChild(h('h3', 'rc-curve__title', title));
      c.appendChild(h('p', 'rc-curve__subtitle', subtitle));
      var cv = h('canvas', 'rc-curve__canvas'); cv.setAttribute('role', 'img');
      c.appendChild(cv);
      stage.appendChild(c);
      return cv;
    }
    var cvX = card('Stretch curve <i>x</i><sub>k</sub>', 'cents of f<sub>1</sub> from f<sub>T</sub>(k) · ET at 0 · band = ±Risk <span class="rc-curve__more">(1σ shift any key could still cause)</span>');
    var cvB = card('Inharmonicity <i>B</i>(k)', 'log axis · points = measured <span class="rc-curve__more">(tension-corrected)</span> · band = ±σ · break marker at k<sub>plain</sub>');
    var stripWrap = h('div', 'rc-curve__strip');
    var cvK = h('canvas', 'rc-curve__canvas rc-curve__canvas--keys'); cvK.setAttribute('aria-hidden', 'true');
    stripWrap.appendChild(cvK); stage.appendChild(stripWrap);
    /* One real range input spans the whole chart area: focus ring, arrow keys and screen-reader value. */
    var range = h('input', 'rc-curve__range'); range.type = 'range'; range.min = '1'; range.max = '88'; range.step = '1'; range.value = '40';
    range.setAttribute('aria-label', 'Key under the crosshair. Arrow keys move one key, Page Up and Page Down one octave.');
    stage.appendChild(range);

    var row = h('div', 'rc-curve__row'); row.setAttribute('aria-live', 'off');
    var rowTop = h('div', 'rc-curve__rowtop');
    var rowName = h('span', 'rc-curve__note');
    var rowBadge = h('span', 'rc-curve__badge rc-curve__badge--purple');
    rowTop.appendChild(rowName); rowTop.appendChild(rowBadge);
    var grid = h('dl', 'rc-curve__grid');
    var CELLS = [['x', 'x'], ['f1', 'f<sub>1</sub>'], ['fT', 'f<sub>T</sub>'], ['B', 'B'], ['sigma', 'σ log<sub>10</sub>B'], ['source', 'source'], ['n', 'n*'], ['pn', 'p<sub>n*</sub>'], ['risk', 'risk']];
    var cells = {}, cache = {};
    CELLS.forEach(function (c) {
      var w = h('div', 'rc-curve__cell'); var dt = h('dt', null, c[1]); var dd = h('dd');
      w.appendChild(dt); w.appendChild(dd); grid.appendChild(w); cells[c[0]] = dd;
    });
    row.appendChild(rowTop); row.appendChild(grid);

    var foot = h('div', 'rc-curve__foot');
    var legend = h('ul', 'rc-curve__legend');
    [['line-a', '<i>x</i><sub>k</sub>'], ['band-a', '±Risk'], ['dot-p', 'measured key'], ['line-p', '<i>B</i>(k) model'], ['band-p', '±σ'], ['dot-r', 'wizard measurement']].forEach(function (l) {
      var li = h('li'); li.appendChild(h('span', 'rc-curve__sw rc-curve__sw--' + l[0])); li.appendChild(h('span', null, l[1])); legend.appendChild(li);
    });
    var caption = h('p', 'rc-curve__count');
    foot.appendChild(legend); foot.appendChild(caption);

    root.appendChild(head); root.appendChild(stage); root.appendChild(row); root.appendChild(foot);
    el.appendChild(root);

    function setText(node, id, text) { if (cache[id] !== text) { cache[id] = text; node.textContent = text; } }
    function setHTML(node, id, html) { if (cache[id] !== html) { cache[id] = html; node.innerHTML = html; } }

    /* ------------------------------------------------------------ state */
    var t = env.reduceMotion ? END : 0;     // story clock
    var playing = false, started = false, active = false, destroyed = false;
    var raf = 0, lastTs = null, dirty = true;
    var key = 40;                            // crosshair key (C4)
    var dpr = 1, W = 0, HX = 0, HB = 0, HK = 0;
    var cur = { x: new Float64Array(N), risk: new Float64Array(N), lb: new Float64Array(N), sigma: new Float64Array(N) };
    var px = new Float64Array(N), ya = new Float64Array(N), yb = new Float64Array(N), yc = new Float64Array(N);
    var rx = new Float64Array(N), ry = new Float64Array(N), tan = new Float64Array(N);
    var ctxX = cvX.getContext('2d'), ctxB = cvB.getContext('2d'), ctxK = cvK.getContext('2d');

    function story() {
      // → { i: arrivals so far (0…14), from, to, p, local: seconds since the newest arrival }
      if (t < LEAD) return { n: 0, from: 0, to: 0, p: 0, local: 0 };
      var i = Math.min(STEPS - 1, Math.floor((t - LEAD) / STEP));
      var local = t - LEAD - i * STEP;
      return { n: i + 1, from: i, to: i + 1, p: easeInOut(local / MORPH), local: local };
    }

    /* ------------------------------------------------------------ drawing */
    function xOf(k) { return PL + (k - 1) / 87 * (W - PL - PR); }
    function snap(v) { return Math.round(v * dpr) / dpr + 0.5 / dpr; }
    function font(ctx, px_, weight) { ctx.font = (weight || 500) + ' ' + px_ + 'px ' + F.ui; }

    function axes(ctx, H, yOfTick, ticks, labels) {
      var i, x, y, right = W - PR, bottom = H - PB;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1 / dpr < 0.75 ? 0.75 : 1; ctx.strokeStyle = T.hairline;
      ctx.beginPath();
      for (i = 0; i < TICK_KEYS.length; i++) { x = snap(xOf(TICK_KEYS[i])); ctx.moveTo(x, PT); ctx.lineTo(x, bottom); }
      for (i = 0; i < ticks.length; i++) { y = snap(yOfTick(ticks[i])); ctx.moveTo(PL, y); ctx.lineTo(right, y); }
      ctx.stroke();
      font(ctx, 10); ctx.fillStyle = T['text-2']; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      for (i = 0; i < ticks.length; i++) ctx.fillText(labels[i], right + 6, yOfTick(ticks[i]) + 0.5);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
      var tight = xOf(4) - xOf(1) < 18;
      for (i = 0; i < TICK_KEYS.length; i++) {
        if (tight && TICK_KEYS[i] === 4) continue; // A0 and C1 collide on phones; the grid line stays
        x = xOf(TICK_KEYS[i]);
        ctx.fillText(keyName(TICK_KEYS[i]), Math.max(8, x), H - 4);
      }
    }

    function crosshair(ctx, H) {
      var x = snap(xOf(key));
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = T.text; ctx.lineWidth = 1; // RuleMark text @ 50 %
      ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, H - PB); ctx.stroke(); ctx.restore();
    }

    function band(ctx, top, bot, colour) {
      var k;
      for (k = 0; k < N; k++) { rx[k] = px[N - 1 - k]; ry[k] = bot[N - 1 - k]; }
      ctx.beginPath();
      tracePath(ctx, px, top, N, tan, true);
      tracePath(ctx, rx, ry, N, tan, false);
      ctx.closePath();
      ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = colour; ctx.fill(); ctx.restore(); // Theme.Measure.curveBandOpacity
    }

    function dot(ctx, x, y, r, colour, age) {
      // arrival: grow 0 → r in 200 ms (easeOut, no overshoot) with one fading ring
      var grow = age == null ? 1 : easeOut(age / 0.2);
      if (age != null && age < 0.6) {
        ctx.save(); ctx.globalAlpha = 0.55 * (1 - age / 0.6); ctx.strokeStyle = colour; ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.arc(x, y, r + 9 * easeOut(age / 0.6), 0, 6.2832); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(x, y, r * grow, 0, 6.2832); ctx.fill();
    }

    function drawStretch(s) {
      var ctx = ctxX, H = HX, k, i, ph = H - PT - PB;
      function yOf(c) { return PT + (Y_MAX - c) / (Y_MAX - Y_MIN) * ph; }
      axes(ctx, H, yOf, [-20, -10, 0, 10, 20, 30], ['−20', '−10', '0', '+10', '+20', '+30']);
      font(ctx, 10); ctx.fillStyle = T['text-2']; ctx.textAlign = 'left'; ctx.fillText('cents', PL, 10);
      // ET rule: dashed 4-3, annotated top-leading
      var y0 = snap(yOf(0));
      ctx.save(); ctx.strokeStyle = T['text-2']; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(PL, y0); ctx.lineTo(W - PR, y0); ctx.stroke(); ctx.restore();
      ctx.fillText('ET', PL + 4, y0 - 5);

      ctx.save(); ctx.beginPath(); ctx.rect(PL - 4, PT - 2, W - PL - PR + 8, ph + 4); ctx.clip();
      for (k = 0; k < N; k++) { ya[k] = yOf(cur.x[k] + cur.risk[k]); yb[k] = yOf(cur.x[k] - cur.risk[k]); yc[k] = yOf(cur.x[k]); }
      band(ctx, ya, yb, T.accent);
      ctx.beginPath(); tracePath(ctx, px, yc, N, tan, true);
      ctx.strokeStyle = T.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
      for (i = 0; i < s.n; i++) {
        k = ORDER[i];
        dot(ctx, px[k - 1], yc[k - 1], 3.5, T.measured, playing && i === s.n - 1 ? s.local : null); // symbolSize 40 ≈ 7 px
      }
      if (playing && s.n > 0 && s.local < STEP) {
        k = ORDER[s.n - 1];
        var a = Math.min(1, s.local / 0.2) * Math.min(1, (STEP - s.local) / 0.2);
        ctx.save(); ctx.globalAlpha = a; font(ctx, 11, 650); ctx.fillStyle = T.measured; ctx.textAlign = 'center';
        ctx.fillText(keyName(k), Math.min(W - PR - 10, Math.max(PL + 10, px[k - 1])), yc[k - 1] - 12); ctx.restore();
      }
      crosshair(ctx, H);
    }

    function drawB(s) {
      var ctx = ctxB, H = HB, k, i, ph = H - PT - PB;
      function yOf(lb) { return PT + (LB_MAX - lb) / (LB_MAX - LB_MIN) * ph; }
      axes(ctx, H, yOf, [-5, -4, -3, -2], ['1.0e-5', '1.0e-4', '1.0e-3', '1.0e-2']);
      ctx.save(); ctx.beginPath(); ctx.rect(PL - 4, PT, W - PL - PR + 8, ph); ctx.clip();
      for (k = 0; k < N; k++) { ya[k] = yOf(cur.lb[k] + cur.sigma[k]); yb[k] = yOf(cur.lb[k] - cur.sigma[k]); yc[k] = yOf(cur.lb[k]); }
      band(ctx, ya, yb, T.measured);
      ctx.beginPath(); tracePath(ctx, px, yc, N, tan, true);
      ctx.strokeStyle = T.measured; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
      // break marker at k_plain − 0.5: warn, dashed 3-3, annotated on top
      var xb = snap(xOf(K_PLAIN - 0.5));
      ctx.save(); ctx.strokeStyle = T.warn; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(xb, PT); ctx.lineTo(xb, H - PB); ctx.stroke(); ctx.restore();
      font(ctx, 10); ctx.fillStyle = T.warn; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('break guess', Math.max(PL + 30, xb), PT - 5);
      for (i = 0; i < s.n; i++) {
        k = ORDER[i];
        // the measurement itself does not move: it sits at the measured B
        dot(ctx, px[k - 1], yOf(states[STEPS].lb[k - 1]), 3.7, T.reference, playing && i === s.n - 1 ? s.local : null); // symbolSize 45
      }
      crosshair(ctx, H);
    }

    function drawKeys(s) {
      // A chromatic strip (one equal slot per key, so every key sits under its x on the charts), drawn as a keyboard.
      var ctx = ctxK, H = HK, k, slot = (W - PL - PR) / 87, top = 1, kh = 16, x0;
      var left = xOf(1) - slot / 2, right = xOf(N) + slot / 2;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 0.82; ctx.fillStyle = T['white-key']; ctx.fillRect(left, top, right - left, kh); ctx.globalAlpha = 1;
      if (!isBlack(key)) { // the white key under the crosshair spans to the middle of its black neighbours
        var a = xOf(key) - slot / 2 - (key > 1 && isBlack(key - 1) ? slot / 2 : 0), b = xOf(key) + slot / 2 + (key < N && isBlack(key + 1) ? slot / 2 : 0);
        ctx.fillStyle = T.accent; ctx.fillRect(a, top, b - a, kh);
      }
      ctx.fillStyle = T.bg;
      var lw = slot > 4 ? 1 : 0.5;
      for (k = 1; k < N; k++) { // white-key joints: under each black key, and at B|C and E|F
        if (isBlack(k)) ctx.fillRect(Math.round(xOf(k) * dpr) / dpr - lw / 2, top, lw, kh);
        else if (!isBlack(k + 1)) ctx.fillRect(Math.round((xOf(k) + slot / 2) * dpr) / dpr - lw / 2, top, lw, kh);
      }
      for (k = 1; k <= N; k++) {
        if (!isBlack(k)) continue;
        x0 = xOf(k) - slot / 2;
        ctx.fillStyle = T.bg; ctx.fillRect(x0 - 0.5, top, slot + 1, kh * 0.62 + 0.5);
        ctx.fillStyle = k === key ? T.accent : T['black-key']; ctx.fillRect(x0, top, slot, kh * 0.62);
      }
      ctx.fillStyle = T.measured;
      for (var i = 0; i < s.n; i++) { ctx.beginPath(); ctx.arc(xOf(ORDER[i]), top + kh + 5.5, 2, 0, 6.2832); ctx.fill(); }
    }

    /* ------------------------------------------------------------ text */
    var lastN = -1;
    function isMeasured(k, n) { for (var i = 0; i < n; i++) if (ORDER[i] === k) return true; return false; }

    function paintText(s) {
      var st = states[s.n];
      if (s.n !== lastN) {
        lastN = s.n;
        setText(sub, 'sub', 'Standard · equal · A4 = 440.0 Hz · ' + s.n + ' measured');
        // SessionState.swift:169-170 + CurveReadiness thresholds; colours Theme+Measure.swift:56-65
        var level = s.n === 0 ? 'none' : st.maxRisk < 0.5 ? 'excellent' : st.maxRisk < 1.0 ? 'reliable' : st.maxRisk < 1.5 ? 'usable' : 'insufficient';
        badge.className = 'rc-curve__badge rc-curve__badge--' + (level === 'excellent' ? 'green' : level === 'reliable' ? 'blue' : level === 'usable' ? 'amber' : 'grey');
        setText(badge, 'badge', s.n === 0 ? 'curve —' : 'curve ' + level + ' (' + st.maxRisk.toFixed(1) + '¢)');
        setText(riskBadge, 'riskBadge', 'max risk ' + keyName(st.maxKey) + ' ' + st.maxRisk.toFixed(2) + '¢');
        setText(caption, 'caption', 'measured ' + s.n + ' · ' + (s.n === 0 ? 'prior ' : 'modelled ') + (N - s.n));
        cvX.setAttribute('aria-label', 'Stretch curve, ' + (s.n === 0 ? 'before any measurement' : 'after ' + s.n + ' measured notes') + ': A0 ' + signed(st.x[0], 2) + '¢ to C8 ' + signed(st.x[87], 2) +
          '¢ relative to equal temperament. Uncertainty band at most ±' + st.maxRisk.toFixed(2) + '¢, widest at ' + keyName(st.maxKey) + '. ' +
          (s.n === 0 ? 'Readiness: no measurements yet.' : 'Readiness: ' + level + '.') + ' Illustrative synthetic data.');
        cvB.setAttribute('aria-label', 'Inharmonicity model with ' + s.n + ' measurement' + (s.n === 1 ? '' : 's') + ', logarithmic axis. ' +
          (s.n === STEPS ? 'B falls through the copper-wound bass from 3.8e-4 at A0 to 9.1e-5 at E2, steps up about two-fold at the break guess between E2 and F2, then rises to 2.1e-2 at C8.' :
            s.n === 0 ? 'The prior only: a smooth curve with a wide ±σ band and no measured points.' : 'The model is settling toward the measured points; the ±σ band narrows near each one.') + ' Illustrative synthetic data.');
      }
      var i = key - 1, x = cur.x[i], B = Math.pow(10, cur.lb[i]), f1 = fT(key) * Math.pow(2, x / 1200), n = nStar(key);
      var meas = isMeasured(key, s.n);
      if (meas) { B = FINAL_B[i]; }
      var src = s.n === 0 ? 'prior' : meas ? 'wizard' : 'modelled';
      setText(rowName, 'name', keyName(key));
      setText(cells.x, 'x', signed(x, 2) + '¢');
      setText(cells.f1, 'f1', f1.toFixed(3) + ' Hz');
      setText(cells.fT, 'fT', fT(key).toFixed(3) + ' Hz');
      setText(cells.B, 'B', fmtB(B));
      setText(cells.sigma, 'sigma', cur.sigma[i].toFixed(3));
      setText(cells.source, 'source', src);
      setText(cells.n, 'n', String(n));
      setText(cells.pn, 'pn', (n * f1 * Math.sqrt((1 + B * n * n) / (1 + B))).toFixed(2) + ' Hz');
      setText(cells.risk, 'risk', cur.risk[i].toFixed(2) + '¢');
      // the app shows this badge for measured keys only; the slot stays reserved so the card never jumps
      if (meas) setText(rowBadge, 'rowBadge', 'measured wizard · conf ' + CONF[key].toFixed(2));
      if (cache.rowMeas !== meas) { cache.rowMeas = meas; rowBadge.style.visibility = meas ? 'visible' : 'hidden'; }
      var vt = keyName(key) + ', key ' + key + ' of 88: x ' + signed(x, 2) + ' cents, B ' + fmtB(B) + ', risk ' + cur.risk[i].toFixed(2) + ' cents, ' + (meas ? 'measured' : src);
      if (cache.vt !== vt && (!playing || cache.vtKey !== key)) { cache.vt = vt; cache.vtKey = key; range.setAttribute('aria-valuetext', vt); }
    }

    function paintButton() {
      var html, label;
      if (env.reduceMotion) {
        html = ICON_SWAP + '<span>' + (t >= END ? 'Before measuring' : 'After 14 notes') + '</span>';
        label = t >= END ? 'Show the curve before any measurement' : 'Show the curve after 14 measured notes';
      } else if (playing) { html = ICON_SKIP + '<span>Skip</span>'; label = 'Skip to the finished curve'; }
      else { html = ICON_REPLAY + '<span>Replay</span>'; label = 'Replay: measure the 14 notes again'; }
      setHTML(btn, 'btn', html); btn.setAttribute('aria-label', label);
    }

    function render() {
      if (!W) return;
      var s = story(), a = states[s.from], b = states[s.to], p = s.p, k;
      for (k = 0; k < N; k++) {
        cur.x[k] = a.x[k] + (b.x[k] - a.x[k]) * p;
        cur.risk[k] = a.risk[k] + (b.risk[k] - a.risk[k]) * p;
        cur.lb[k] = a.lb[k] + (b.lb[k] - a.lb[k]) * p;
        cur.sigma[k] = a.sigma[k] + (b.sigma[k] - a.sigma[k]) * p;
      }
      drawStretch(s); drawB(s); drawKeys(s); paintText(s);
    }

    /* ------------------------------------------------------------ loop (one rAF, stopped when idle) */
    function frame(ts) {
      raf = 0;
      if (!active || destroyed) return;
      if (playing) {
        var dt = lastTs == null ? 0 : Math.min(0.1, (ts - lastTs) / 1000);
        lastTs = ts; t += dt; dirty = true;
        if (t >= END) { t = END; playing = false; paintButton(); }
      }
      if (dirty) { dirty = false; render(); }
      if (playing) raf = requestAnimationFrame(frame);
    }
    function invalidate() {
      dirty = true;
      if (active) { if (!raf) { lastTs = null; raf = requestAnimationFrame(frame); } }
      else { dirty = false; render(); }   // off-screen: one static paint, no loop
    }
    function play() { t = 0; lastN = -1; playing = true; started = true; paintButton(); invalidate(); }
    function finish(at) { playing = false; t = at; paintButton(); invalidate(); }

    /* ------------------------------------------------------------ sizing */
    function fit(cv, ctx) {
      var w = cv.clientWidth, hh = cv.clientHeight;
      var bw = Math.max(1, Math.round(w * dpr)), bh = Math.max(1, Math.round(hh * dpr));
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return hh;
    }
    function resize() {
      if (destroyed) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = cvX.clientWidth; if (!w) return;
      el.classList.toggle('is-narrow', el.clientWidth < 480);
      W = cvX.clientWidth; // re-read: the class may change the card padding
      HX = fit(cvX, ctxX); HB = fit(cvB, ctxB); HK = fit(cvK, ctxK);
      for (var k = 0; k < N; k++) px[k] = xOf(k + 1);
      invalidate();
    }
    var ro = null;
    if ('ResizeObserver' in window) { ro = new ResizeObserver(resize); ro.observe(el); }
    else window.addEventListener('resize', resize);

    /* ------------------------------------------------------------ interaction */
    function setKey(k, fromRange) {
      k = Math.max(1, Math.min(N, Math.round(k)));
      if (k === key) return;
      key = k; if (!fromRange) range.value = String(k);
      invalidate();
    }
    function keyAt(clientX) {
      var r = cvX.getBoundingClientRect();
      return 1 + (clientX - r.left - PL) / (r.width - PL - PR) * 87;
    }
    var dragging = false;
    function onDown(e) { if (e.pointerType !== 'mouse') dragging = true; setKey(keyAt(e.clientX)); try { range.focus({ preventScroll: true }); } catch (err) { /* old Safari */ } }
    function onMove(e) { if (e.pointerType === 'mouse' || dragging) setKey(keyAt(e.clientX)); }
    function onUp() { dragging = false; }
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    range.addEventListener('input', function () { setKey(Number(range.value), true); });
    range.addEventListener('keydown', function (e) {
      if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); setKey(key + (e.key === 'PageUp' ? 12 : -12)); }
    });
    btn.addEventListener('click', function () {
      if (env.reduceMotion) { lastN = -1; finish(t >= END ? 0 : END); }
      else if (playing) finish(END);
      else play();
    });
    env.onReduceMotionChange(function (rm) {
      if (destroyed) return;
      if (rm) finish(END); else { paintButton(); }
    });

    paintButton();
    resize();

    return {
      setActive: function (on) {
        on = !!on; if (on === active || destroyed) return;
        active = on;
        if (!on) { if (raf) { cancelAnimationFrame(raf); raf = 0; } lastTs = null; return; }
        if (!started && !env.reduceMotion) { play(); return; }   // the story runs once, when first seen
        if (!W) resize();
        lastTs = null; dirty = true; if (!raf) raf = requestAnimationFrame(frame);
      },
      /* dev harness: jump the story clock */
      seek: function (sec) { started = true; t = Math.max(0, Math.min(END, sec)); playing = !env.reduceMotion && t < END; lastN = -1; paintButton(); invalidate(); },
      setKey: function (k) { setKey(k); },
      duration: END,
      destroy: function () {
        destroyed = true; active = false; playing = false;
        if (raf) cancelAnimationFrame(raf); raf = 0;
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  };
})();
