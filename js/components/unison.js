/* unison.js — a live, SILENT recreation of the app's Unison panel (App/Views/Tune/UnisonPanel.swift) with a
   visual of two strings beating. All values are illustrative and computed from the app's own formulas
   (TunerCore UnisonAnalyzer.swift:208-217): beat @ partial = |Δf|, beat @ fundamental = |Δf|/(n*·R_n*(B)),
   offset = 1200·log2(1 + Δf/f_ref). No WebAudio, no network. */
(function () {
  'use strict';

  var MINUS = '−', CENT = '¢', DASH = '—';

  /* A4 at the tracked partial n* = 2 (research: tune-instruments.md "Constants"). */
  var N_STAR = 2, B = 6.4e-4, F1 = 440;
  var R2 = Math.sqrt((1 + N_STAR * N_STAR * B) / (1 + B));   // Inharmonicity.R(n, B)
  var F_REF = N_STAR * F1 * R2;                                // 880.84 Hz
  var CLEAN_HZ = 0.3;            // lamp text: "clean (< 0.3 Hz over 3 s)"
  var CLEAN_HOLD = 1.5;          // demo compresses the app's 3 s window; the wording is kept
  var T_U = 3;                   // UnisonAnalyzer window for k <= 63
  var MIN_HZ = 1 / T_U;          // "beat < 0.33 Hz" (report.message in the unresolved state)
  var PENCIL_MIN = 0.25 * MIN_HZ; // UnisonAnalyzer.swift:188 — the pencil resolves down to 0.25/T_u
  var RANGE = 6;                 // pin range, cents

  var SIM_DT = 1 / 120, WINDOW_S = 4, NBUF = Math.round(WINDOW_S / SIM_DT) + 1;
  var F_STROBE = 3;              // apparent reference-string rate (Hz) as under a strobe light — schematic
  var F_CARRIER = 11;            // schematic fine structure of the summed band (Hz on the 4 s axis)
  var A1 = 1, A2 = 0.8;          // relative loudness of the two strings

  var START_LEFT = 1200 * Math.log(1 + 1.84 / F_REF) / Math.LN2;   // +3.61¢  <=>  Δf = +1.84 Hz
  var START_RIGHT = -4.1;
  /* Autoplay: [t0, t1, to] pulls of the virtual tuning lever. */
  var PULLS_LEFT = [[2.4, 3.2, 1.5], [4.6, 5.3, -0.9], [7.0, 7.6, -0.17]];
  var PULLS_RIGHT = [[13.2, 14.0, -1.7], [15.2, 15.9, 0.8], [17.4, 18.0, 0.17]];
  var T_RIGHT = 11.2, T_DONE = 20.6, T_LOOP = 23.4;
  var T_MID_LEFT = 10.0, T_MID_RIGHT = 21.3;   // middle of each "clean" stretch

  var STEP_TEXT = {
    1: 'Reference (MIDDLE) string tuned. Remove the LEFT mute only. Play the note and turn the LEFT pin until the beating stops (lamp turns green).',
    2: 'Now remove the RIGHT mute. Play the note and turn the RIGHT pin until the lamp turns green. Never touch the MIDDLE pin again.'
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(u) { u = clamp(u, 0, 1); return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }   // easeInOut, no overshoot
  function dfFromCents(c) { return F_REF * (Math.pow(2, c / 1200) - 1); }
  function signed(v, d) { var s = Math.abs(v).toFixed(d); return (v < 0 ? MINUS : '+') + s; }   // Theme.Format.signed
  function rgb(str) {
    var m = /^#([0-9a-f]{6})$/i.exec(str || '');
    if (!m) return [232, 234, 240];
    var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, k) { return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)]; }
  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  /* Autoplay offset (cents) at time t. d1/d2 delay the first pull of each string by a fraction of a second. */
  function centsAt(t, d1, d2) {
    var right = t >= T_RIGHT, pulls = right ? PULLS_RIGHT : PULLS_LEFT, c = right ? START_RIGHT : START_LEFT, d = right ? d2 : d1;
    for (var i = 0; i < pulls.length; i++) {
      var p = pulls[i], sh = i === 0 ? d : 0;
      if (t < p[0] + sh) break;
      if (t < p[1] + sh) { c += (p[2] - c) * ease((t - p[0] - sh) / (p[1] - p[0])); break; }
      c = p[2];
    }
    return c;
  }
  /* The leftover beat after the last pull is very slow (about 0.09 Hz). Time the first pull so that the two strings are
     in phase in the middle of the clean stretch; otherwise the demo could settle on a quiet part of that slow beat and
     show a thin band next to a green lamp. Returns the delay in seconds. */
  function alignPull(tFrom, tMid, phaseIn, right) {
    var best = 0, bestErr = 9, d, t, ph, err;
    for (d = 0; d < 0.6; d += 0.005) {
      ph = phaseIn;
      for (t = tFrom + SIM_DT; t <= tMid; t += SIM_DT) ph += 2 * Math.PI * dfFromCents(centsAt(t, right ? 0 : d, right ? d : 0)) * SIM_DT;
      err = Math.abs(Math.atan2(Math.sin(ph), Math.cos(ph)));
      if (err < bestErr) { bestErr = err; best = d; }
    }
    return best;
  }
  var PHASE_IN_LEFT = 2 * Math.PI * dfFromCents(PULLS_RIGHT[2][2]) * (T_LOOP - T_MID_RIGHT);   // phase carried over the loop point
  var PHASE_IN_RIGHT = 2 * Math.PI * dfFromCents(PULLS_LEFT[2][2]) * (T_RIGHT - T_MID_LEFT);
  var D_LEFT = alignPull(0, T_MID_LEFT, PHASE_IN_LEFT, false);
  var D_RIGHT = alignPull(T_RIGHT, T_MID_RIGHT, PHASE_IN_RIGHT, true);

  var uid = 0;

  function mount(el, env) {
    var id = 'rc-unison-' + (++uid);
    var fb = el.querySelector('.rc-fallback'); if (fb) fb.remove();

    /* ---------- DOM ---------- */
    var head = h('div', 'rc-unison__head');
    head.appendChild(h('p', 'rc-unison__title', 'Unison · A4'));
    head.appendChild(h('span', 'rc-unison__badge', 'listening for two strings'));

    var viz = h('div', 'rc-unison__viz');
    var canvas = h('canvas', 'rc-unison__canvas');
    canvas.setAttribute('role', 'img');
    viz.appendChild(canvas);
    var note = h('p', 'rc-unison__note');
    function paintNote() {
      note.textContent = env.reduceMotion
        ? 'The strings are drawn as one instant under a strobe light. The band below them is a still plot of 4 s of their combined loudness. Silent, illustrative values.'
        : 'The strings are drawn slowed, as under a strobe light. The swell below them runs in real time. Silent, illustrative values.';
    }
    paintNote();

    var readings = h('div', 'rc-unison__readings'); readings.setAttribute('aria-live', 'off');
    function stack(cls, capText) {
      var s = h('div', 'rc-unison__stack ' + cls), v = h('span', 'rc-unison__value'), c = h('span', 'rc-unison__cap', capText);
      s.appendChild(v); s.appendChild(c); readings.appendChild(s); return v;
    }
    var vBeat = stack('rc-unison__stack--beat', 'beat @ partial ' + N_STAR);
    var vFund = stack('', 'beat @ fundamental');
    var vOff = stack('', 'open string offset');

    var verdict = h('div', 'rc-unison__verdict'); verdict.setAttribute('aria-live', 'off');
    var lamp = h('span', 'rc-unison__lamp'); lamp.setAttribute('role', 'img');
    var dir = h('span', 'rc-unison__dir');
    verdict.appendChild(lamp); verdict.appendChild(dir);

    var stepper = h('div', 'rc-unison__stepper');
    var ol = h('ol', 'rc-unison__steps'); ol.setAttribute('aria-label', 'Unison steps');
    var caps = ['Reference', 'LEFT', 'RIGHT'].map(function (t, i) {
      var li = h('li', 'rc-unison__step'), c = h('span', 'rc-unison__capsule', t);
      li.appendChild(c);
      if (i < 2) { var a = h('span', 'rc-unison__arrow', '→'); a.setAttribute('aria-hidden', 'true'); li.appendChild(a); }
      ol.appendChild(li); return li;
    });
    var done = h('span', 'rc-unison__done', 'Unisons done');
    stepper.appendChild(ol); stepper.appendChild(done);
    var stepText = h('p', 'rc-unison__steptext');

    var pin = h('div', 'rc-unison__pin');
    var pinHead = h('div', 'rc-unison__pinhead');
    var label = h('label', 'rc-unison__pinlabel', 'Tuning pin · open string'); label.setAttribute('for', id);
    var out = h('output', 'rc-unison__pinvalue'); out.setAttribute('for', id);
    pinHead.appendChild(label); pinHead.appendChild(out);
    var rangeWrap = h('div', 'rc-unison__range');
    var rail = h('div', 'rc-unison__rail'); rail.setAttribute('aria-hidden', 'true');
    rail.appendChild(h('i', 'rc-unison__zone'));
    var input = h('input', 'rc-unison__input');
    input.type = 'range'; input.id = id; input.min = String(-RANGE); input.max = String(RANGE); input.step = '0.1';
    rangeWrap.appendChild(rail); rangeWrap.appendChild(input);
    var scale = h('div', 'rc-unison__scale'); scale.setAttribute('aria-hidden', 'true');
    scale.appendChild(h('span', '', MINUS + RANGE + CENT + ' flat'));
    scale.appendChild(h('span', 'rc-unison__scale-mid', 'under 0.3 Hz'));
    scale.appendChild(h('span', '', '+' + RANGE + CENT + ' sharp'));
    var foot = h('div', 'rc-unison__pinfoot');
    var hint = h('span', 'rc-unison__hint', 'Drag the pin, or use the arrow keys, to close the beat.');
    var resume = h('button', 'rc-unison__resume', 'Resume demo'); resume.type = 'button';
    var pause = h('button', 'rc-unison__pause', 'Pause'); pause.type = 'button'; pause.setAttribute('aria-pressed', 'false'); pause.setAttribute('aria-label', 'Pause the animation');
    pause.hidden = !!env.reduceMotion;
    foot.appendChild(hint); foot.appendChild(resume); foot.appendChild(pause);
    pin.appendChild(pinHead); pin.appendChild(rangeWrap); pin.appendChild(scale); pin.appendChild(foot);

    var live = h('p', 'rc-unison__live'); live.setAttribute('aria-live', 'polite');

    [head, viz, note, readings, verdict, stepper, stepText, pin, live].forEach(function (n) { el.appendChild(n); });

    /* ---------- State ---------- */
    var paused = false;     // the visitor's Pause button (WCAG 2.2.2)
    var S = { mode: 'auto', t: 0, cents: START_LEFT, stage: 1, done: false, dphi: 0, phi1: 0, under: 0, clean: false, n: 0, cleanMix: 0 };
    var buf = new Float32Array(NBUF), head_i = 0;     // ring buffer of the summed envelope, one sample per SIM_DT
    var active = false, raf = 0, lastTs = 0, acc = 0, sincePaint = 1, holdTimer = 0, destroyed = false;
    var W = 0, H = 0, dpr = 1, ctx = canvas.getContext('2d');
    var cache = {}, ariaKey = '', ariaAt = -10, liveKey = '';

    var C = {
      ref: rgb(env.tokens.reference), open: rgb(env.tokens.accent), ok: rgb(env.tokens['in-tune']),
      text: rgb(env.tokens.text), text2: rgb(env.tokens['text-2']), copper: rgb(env.tokens.copper)
    };

    function envelope(dphi) { return Math.sqrt(A1 * A1 + A2 * A2 + 2 * A1 * A2 * Math.cos(dphi)) / (A1 + A2); }
    function push() { head_i = (head_i + 1) % NBUF; buf[head_i] = envelope(S.dphi); S.n++; }

    /* Fill the whole 4 s window as if the current Δf had been held — used at start and for the static (reduced motion) view. */
    function prefill() {
      var w = 2 * Math.PI * dfFromCents(S.cents) * SIM_DT;
      S.dphi -= w * (NBUF - 1);
      for (var i = 0; i < NBUF; i++) { head_i = (head_i + 1) % NBUF; buf[head_i] = envelope(S.dphi); if (i < NBUF - 1) S.dphi += w; }
    }

    function timeline(t) { S.cents = centsAt(t, D_LEFT, D_RIGHT); S.stage = t >= T_RIGHT ? 2 : 1; S.done = t >= T_DONE; }

    function reset() {
      S.t = 0; S.cents = START_LEFT; S.stage = 1; S.done = false; S.dphi = PHASE_IN_LEFT; S.phi1 = 0.5; S.under = 0; S.clean = false; S.cleanMix = 0;
      prefill();
    }

    function step(dt) {
      if (S.mode === 'auto') { S.t += dt; if (S.t >= T_LOOP) S.t -= T_LOOP; timeline(S.t); }
      var df = dfFromCents(S.cents);
      S.dphi += 2 * Math.PI * df * dt; S.phi1 += 2 * Math.PI * F_STROBE * dt;
      if (Math.abs(df) < CLEAN_HZ) S.under += dt; else S.under = 0;
      S.clean = S.under >= CLEAN_HOLD;
      S.cleanMix = clamp(S.cleanMix + (S.clean ? dt : -dt) / 0.2, 0, 1);   // 200 ms state change
      push();
    }

    /* ---------- Readouts (strings exactly as UnisonPanel.readings prints them) ---------- */
    function set(node, key, value, attr) {
      if (cache[key] === value) return;
      cache[key] = value;
      if (attr) node.setAttribute(attr, value); else node.textContent = value;
    }
    function cls(node, key, name, on) {
      if (cache[key] === on) return; cache[key] = on; node.classList.toggle(name, on);
    }

    function paint() {
      var df = dfFromCents(S.cents), a = Math.abs(df);
      var state = S.clean ? 'clean' : (a >= PENCIL_MIN ? 'ok' : 'unresolved');
      var beatTxt, fundTxt, offTxt, dirTxt;
      if (state === 'ok') {
        beatTxt = a.toFixed(2) + ' Hz';
        fundTxt = (a / (N_STAR * R2)).toFixed(2) + ' Hz';
        offTxt = signed(S.cents, 1) + CENT;
        dirTxt = df > 0 ? 'LOWER the open string' : 'RAISE the open string';
      } else {
        /* clean / unresolved: deltaF is nil in the app, so the numbers show an em dash. */
        beatTxt = state === 'clean' ? DASH : 'beat < ' + MIN_HZ.toFixed(2) + ' Hz';
        fundTxt = DASH; offTxt = DASH;
        dirTxt = state === 'clean' ? 'clean (< 0.3 Hz over 3 s)' : 'beat < ' + MIN_HZ.toFixed(2) + ' Hz';
      }
      set(vBeat, 'beat', beatTxt); set(vFund, 'fund', fundTxt); set(vOff, 'off', offTxt); set(dir, 'dir', dirTxt);
      cls(vBeat, 'beatMsg', 'is-message', state === 'unresolved');
      cls(vBeat, 'beatDash', 'is-dash', state === 'clean');
      cls(dir, 'dirMsg', 'is-message', state === 'unresolved');
      cls(el, 'clean', 'is-clean', state === 'clean');
      set(lamp, 'lamp', state === 'clean' ? 'clean' : 'beating', 'aria-label');

      for (var i = 0; i < 3; i++) {
        var on = S.stage === i;
        if (cache['cap' + i] !== on) {
          cache['cap' + i] = on; caps[i].classList.toggle('is-active', on);
          if (on) caps[i].setAttribute('aria-current', 'step'); else caps[i].removeAttribute('aria-current');
        }
      }
      set(done, 'done', S.done ? 'Unisons done ✓' : 'Unisons done');
      cls(done, 'doneOn', 'is-done', S.done);
      cls(done, 'doneReady', 'is-ready', S.stage === 2);
      set(stepText, 'step', STEP_TEXT[S.stage]);
      set(label, 'pinlabel', 'Tuning pin · open string (' + (S.stage === 2 ? 'RIGHT' : 'LEFT') + ')');

      var shown = Math.round(clamp(S.cents, -RANGE, RANGE) * 10) / 10;
      if (S.mode === 'auto' && cache.slider !== shown) { cache.slider = shown; input.value = String(shown); }
      set(out, 'out', (shown === 0 ? '0.0' : signed(shown, 1)) + CENT);
      var word = state === 'clean' ? 'clean' : (shown > 0 ? 'open string sharp' : shown < 0 ? 'open string flat' : 'level with the reference');
      set(input, 'valuetext', signed(shown, 1).replace(MINUS, 'minus ').replace('+', 'plus ') + ' cents, ' + word, 'aria-valuetext');

      /* Canvas description: only when the meaning changes, and not more often than every 1.5 s. */
      var bucket = state === 'ok' ? (a >= 1 ? 'fast' : a >= CLEAN_HZ ? 'slow' : 'slower') + (df > 0 ? '+' : '-') : state;
      var key = S.stage + bucket;
      var now = S.n * SIM_DT;
      if (key !== ariaKey && (Math.abs(now - ariaAt) >= 1.5 || !ariaKey)) {
        ariaKey = key; ariaAt = now;
        var which = S.stage === 2 ? 'RIGHT' : 'LEFT';
        var txt = 'Two strings of A4 drawn side by side: the amber reference string and the open ' + which + ' string. ';
        if (state === 'clean') txt += 'They move together and their combined loudness is a steady band: the unison is clean.';
        else if (state === 'unresolved') txt += 'They move almost together; the combined loudness barely changes.';
        else txt += 'The open string is ' + Math.abs(S.cents).toFixed(1) + ' cents ' + (df > 0 ? 'sharp' : 'flat') + ', so their combined loudness swells and fades about ' + a.toFixed(1) + ' times per second.';
        canvas.setAttribute('aria-label', txt);
      }
      if (S.mode === 'manual') {
        var lk = state === 'ok' ? dirTxt : state;
        if (lk !== liveKey) { liveKey = lk; live.textContent = state === 'ok' ? dirTxt : state === 'clean' ? 'Lamp green: clean.' : 'Nearly there: ' + dirTxt + '.'; }
      }
    }

    /* ---------- Canvas ---------- */
    function draw() {
      if (!W || !H) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var small = W < 420, pad = small ? 12 : 18, fs = small ? 11 : 12;
      var A = Math.round(H * 0.07);
      var x0 = pad + 5, x1 = W - pad - 5, L = x1 - x0;
      var yc1 = fs + 12 + A, yc2 = yc1 + 2 * A + fs + 18;
      var bandTop = yc2 + A + fs + 22, bandBot = H - 16, bandMid = (bandTop + bandBot) / 2, bandH = (bandBot - bandTop) / 2;
      var df = dfFromCents(S.cents), a = Math.abs(df);
      var uiFont = '600 ' + fs + 'px ' + env.fonts.ui, monoFont = fs + 'px ' + env.fonts.mono;

      /* Two strings. Mode shape of partial 2 (a node at mid-length), phase as seen under a strobe. */
      function string(yc, phase, col, amp, name, right) {
        ctx.font = uiFont; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillStyle = rgba(col, 0.95);
        ctx.fillText(name, x0 - 5, yc - A - 8);
        if (right) { ctx.font = monoFont; ctx.textAlign = 'right'; ctx.fillStyle = rgba(C.text2, 0.95); ctx.fillText(right, x1 + 5, yc - A - 8); }
        var i, u, n = 64;
        ctx.beginPath();
        for (i = 0; i <= n; i++) { u = i / n; ctx.lineTo(x0 + u * L, yc - A * amp * Math.abs(Math.sin(2 * Math.PI * u))); }
        for (i = n; i >= 0; i--) { u = i / n; ctx.lineTo(x0 + u * L, yc + A * amp * Math.abs(Math.sin(2 * Math.PI * u))); }
        ctx.closePath(); ctx.fillStyle = rgba(col, 0.09); ctx.fill();
        var k = Math.cos(phase);
        ctx.beginPath();
        for (i = 0; i <= n; i++) { u = i / n; ctx.lineTo(x0 + u * L, yc + A * amp * k * Math.sin(2 * Math.PI * u)); }
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(col, 0.2); ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = 1.75; ctx.stroke();
        ctx.fillStyle = rgba(C.text2, 0.9);
        ctx.beginPath(); ctx.arc(x0, yc, 3, 0, 6.2832); ctx.moveTo(x1 + 3, yc); ctx.arc(x1, yc, 3, 0, 6.2832); ctx.fill();
      }
      var which = S.stage === 2 ? 'RIGHT' : 'LEFT';
      string(yc1, S.phi1, C.ref, 1, 'reference string · tuned', small ? 'partial 2' : 'partial 2 · ' + F_REF.toFixed(2) + ' Hz');
      string(yc2, S.phi1 + S.dphi, C.open, A2 / A1 * 1.0, 'open string · ' + which,
        a >= CLEAN_HZ ? 'Δf ' + signed(df, 2) + ' Hz' : 'Δf under 0.3 Hz');

      /* Summed band: x = time, right edge = now, 4 s wide. The envelope is exact; the carrier is schematic. */
      var envCol = mix(C.ref, C.ok, ease(S.cleanMix));
      ctx.font = uiFont; ctx.textAlign = 'left'; ctx.fillStyle = rgba(C.text, 0.92);
      ctx.fillText('both strings together', x0 - 5, bandTop - 10);
      ctx.font = monoFont; ctx.textAlign = 'right'; ctx.fillStyle = rgba(C.text2, 0.95);
      ctx.fillText('last ' + WINDOW_S + ' s', x1 + 5, bandTop - 10);

      var bx0 = x0 - 5, bx1 = x1 + 5, bw = bx1 - bx0, pxPerS = bw / WINDOW_S;
      ctx.strokeStyle = rgba(C.text, 0.1); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx0, bandMid + 0.5); ctx.lineTo(bx1, bandMid + 0.5); ctx.stroke();
      /* second ticks scroll with the signal, so the time scale is honest */
      var tNow = S.n * SIM_DT, frac = tNow - Math.floor(tNow), sx;
      ctx.beginPath();
      for (var s = 0; s <= WINDOW_S; s++) { sx = Math.round(bx1 - (frac + s) * pxPerS) + 0.5; if (sx >= bx0) { ctx.moveTo(sx, bandBot + 3); ctx.lineTo(sx, bandBot + 8); } }
      ctx.strokeStyle = rgba(C.text2, 0.6); ctx.stroke();

      var stepPx = 1.25, count = Math.floor(bw / stepPx), xs = new Array(count + 1), es = new Array(count + 1), j;
      for (j = 0; j <= count; j++) {
        var x = bx1 - j * stepPx, age = (bx1 - x) / pxPerS / SIM_DT, i0 = Math.floor(age), f = age - i0;
        var ia = (head_i - i0 + NBUF * 2) % NBUF, ib = (head_i - Math.min(i0 + 1, NBUF - 1) + NBUF * 2) % NBUF;
        xs[j] = x; es[j] = (buf[ia] * (1 - f) + buf[ib] * f) * bandH;
      }
      var g = ctx.createLinearGradient(bx0, 0, bx1, 0);
      g.addColorStop(0, rgba(envCol, 0)); g.addColorStop(0.18, rgba(envCol, 0.1)); g.addColorStop(1, rgba(envCol, 0.2));
      ctx.beginPath();
      for (j = 0; j <= count; j++) ctx.lineTo(xs[j], bandMid - es[j]);
      for (j = count; j >= 0; j--) ctx.lineTo(xs[j], bandMid + es[j]);
      ctx.closePath(); ctx.fillStyle = g; ctx.fill();

      var gc = ctx.createLinearGradient(bx0, 0, bx1, 0);
      gc.addColorStop(0, rgba(C.copper, 0)); gc.addColorStop(0.2, rgba(C.copper, 0.55)); gc.addColorStop(1, rgba(C.copper, 0.95));
      ctx.beginPath();
      for (j = 0; j <= count; j++) {
        var tt = tNow - (bx1 - xs[j]) / pxPerS;
        ctx.lineTo(xs[j], bandMid + es[j] * Math.sin(2 * Math.PI * F_CARRIER * tt));
      }
      ctx.strokeStyle = gc; ctx.lineWidth = 1; ctx.stroke();

      var ge = ctx.createLinearGradient(bx0, 0, bx1, 0);
      ge.addColorStop(0, rgba(envCol, 0)); ge.addColorStop(0.2, rgba(envCol, 0.8)); ge.addColorStop(1, rgba(envCol, 1));
      ctx.strokeStyle = ge; ctx.lineWidth = 1.75;
      ctx.beginPath(); for (j = 0; j <= count; j++) ctx.lineTo(xs[j], bandMid - es[j]); ctx.stroke();
      ctx.beginPath(); for (j = 0; j <= count; j++) ctx.lineTo(xs[j], bandMid + es[j]); ctx.stroke();

      /* "now": the present loudness */
      ctx.fillStyle = rgba(envCol, 0.25); ctx.beginPath(); ctx.arc(bx1, bandMid - es[0], 6, 0, 6.2832); ctx.fill();
      ctx.fillStyle = rgba(envCol, 1); ctx.beginPath(); ctx.arc(bx1, bandMid - es[0], 3, 0, 6.2832); ctx.fill();
    }

    /* ---------- Loop ---------- */
    function frame(ts) {
      raf = 0;
      if (!active || env.reduceMotion || paused) return;
      var dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0; lastTs = ts;
      acc += dt;
      while (acc >= SIM_DT) { step(SIM_DT); acc -= SIM_DT; sincePaint += SIM_DT; }
      if (sincePaint >= 0.1) { sincePaint = 0; paint(); }     // readouts at 10 Hz, like the app's throttled report
      draw();
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && active && !paused && !env.reduceMotion && !destroyed) { lastTs = 0; raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; clearTimeout(holdTimer); holdTimer = 0; }

    /* Reduced motion: nothing moves by itself. The band is a still plot of 4 s at the current Δf. */
    function renderStatic() {
      clearTimeout(holdTimer); holdTimer = 0;
      var under = Math.abs(dfFromCents(S.cents)) < CLEAN_HZ;
      if (!under) { S.clean = false; S.under = 0; }
      else if (!S.clean && active) {
        holdTimer = setTimeout(function () { holdTimer = 0; S.clean = true; S.cleanMix = 1; paint(); draw(); }, CLEAN_HOLD * 1000);
      }
      S.cleanMix = S.clean ? 1 : 0;
      S.dphi = 0.9; S.phi1 = -0.45; prefill();   // a still frame with both strings visibly displaced
      paint(); draw();
    }

    function goManual() {
      if (S.mode === 'manual') return;
      S.mode = 'manual'; S.done = false; el.classList.add('is-manual');
      resume.textContent = env.reduceMotion ? 'Reset' : 'Resume demo';   // nothing autoplays under reduced motion
    }
    function onInput() {
      goManual();
      S.cents = clamp(parseFloat(input.value) || 0, -RANGE, RANGE);
      cache.slider = S.cents;
      if (env.reduceMotion || !raf) renderStatic(); else paint();
    }
    function onResume() {
      S.mode = 'auto'; el.classList.remove('is-manual'); liveKey = ''; live.textContent = '';
      reset(); cache.slider = null;
      input.focus();
      if (env.reduceMotion || !raf) renderStatic(); else paint();
    }
    input.addEventListener('input', onInput);
    input.addEventListener('pointerdown', goManual);
    resume.addEventListener('click', onResume);

    /* ---------- Size ---------- */
    function resize(w, hh) {
      w = Math.round(w); hh = Math.round(hh);
      if (!w || !hh) return;
      var d = Math.min(window.devicePixelRatio || 1, 2);
      if (w === W && hh === H && d === dpr) return;
      W = w; H = hh; dpr = d;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      draw();
    }
    var ro = null;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(function (entries) { var r = entries[0].contentRect; resize(r.width, r.height); });
      ro.observe(viz);
    } else {
      var onWin = function () { resize(viz.clientWidth, viz.clientHeight); };
      window.addEventListener('resize', onWin); onWin();
    }

    pause.addEventListener('click', function () {
      paused = !paused;
      pause.setAttribute('aria-pressed', String(paused)); pause.textContent = paused ? 'Play' : 'Pause';
      pause.setAttribute('aria-label', paused ? 'Play the animation' : 'Pause the animation');
      if (paused) { stop(); renderStatic(); } else start();
    });
    env.onReduceMotionChange(function (on) {
      pause.hidden = !!on;
      if (destroyed) return;
      paintNote(); if (S.mode === 'manual') resume.textContent = on ? 'Reset' : 'Resume demo';
      if (on) { stop(); if (S.mode === 'auto') reset(); renderStatic(); } else start();
    });

    reset(); input.value = String(Math.round(S.cents * 10) / 10); paint();

    return {
      setActive: function (on) {
        active = !!on && !destroyed;
        if (!active) { stop(); return; }
        if (env.reduceMotion) renderStatic(); else start();
      },
      /* Dev harness: jump the autoplay timeline to `sec` seconds. */
      seek: function (sec) {
        S.mode = 'auto'; el.classList.remove('is-manual'); reset();
        var n = Math.round(clamp(sec, 0, 600) / SIM_DT);
        for (var i = 0; i < n; i++) step(SIM_DT);
        cache.slider = null; ariaKey = ''; paint(); draw();
      },
      destroy: function () {
        destroyed = true; active = false; stop();
        if (ro) ro.disconnect(); else window.removeEventListener('resize', onWin);
        input.removeEventListener('input', onInput); input.removeEventListener('pointerdown', goManual); resume.removeEventListener('click', onResume);
        el.textContent = '';
      }
    };
  }

  window.ResonanceComponents = window.ResonanceComponents || {};
  window.ResonanceComponents.unison = mount;
})();
