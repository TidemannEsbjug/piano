/* wizard.js — live recreation of the measurement wizard's instruction card:
   mute diagram (MuteDiagramView), strike-state ring (StrikeStateRing), one reason line, QualityBar.
   Strings, geometry and thresholds follow the app's Swift source; all values are illustrative. Silent. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* MuteInstruction.swift:34-63 — what the card actually renders is the headline only. */
  var LEFT_DEF = 'LEFT = towards the bass, as you sit at the keyboard.';
  var HEADLINE = {
    3: 'Mute the left string and the right string. Keep the middle string open.',
    2: 'Mute the left string. Keep the right string open.',
    1: 'One string. No mute needed.',
    strip: 'The felt strip is in. No extra mutes needed.'
  };
  /* WizardRunner.strikeText — all three demo notes are k ≤ 40. */
  var STRIKE_TEXT = 'Strike once, firmly (mezzo-forte to forte), and HOLD the key down for about 3 seconds. No pedal.';
  var GOOD_TEXT = 'Good. Strike again to confirm (2 of 2)';
  var AGREED_TEXT = 'Good — two strikes agree.';

  /* Demo clock. Real: 0.5 s of silence arms, T_listen ≈ 2.47 s (k ≤ 40, 48 kHz), analysing ≤ 0.3 s,
     CONFIRMED auto-advance 2.0 s. Listening runs at 0.6× ("quicker than life"). */
  var T_READY = 0.5, T_LISTEN = 2.47 * 0.6, T_ANALYSE = 0.3, T_CONFIRMED = 2.0;
  var AUTO_ARMED = 0.9, AUTO_RESULT = 1.4, AUTO_REJECTED = 2.6;

  /* A three-note batch on the default grand (F1 = lowest 2-string key, C2 = lowest 3-string key).
     fits: per accepted strike { n partials, rmse ¢, snr dB, spread of B across segments }. */
  var NOTES = [
    { name: 'C3', pc: 'C', oct: '3', strings: 3, hint: 'the C below middle C', offset: '−12',
      below: { name: 'B2', strings: 3 }, above: { name: 'C#3', strings: 3 },
      B: '2.4e-4', pct: 3, risk: '1.6', heard: 'B2', dir: 'one white key to the right',
      fits: [{ n: 10, rmse: 0.08, snr: 48.2, spread: 0.006 }, { n: 10, rmse: 0.06, snr: 48.7, spread: 0.006 }] },
    { name: 'A1', pc: 'A', oct: '1', strings: 2, hint: 'the A three octaves below middle C', offset: '−18',
      below: { name: 'G#1', strings: 2 }, above: { name: 'A#1', strings: 2 },
      B: '1.3e-4', pct: 4, risk: '1.4', heard: 'G1', dir: 'one white key to the right',
      fits: [{ n: 11, rmse: 0.09, snr: 46.1, spread: 0.008 }, { n: 12, rmse: 0.08, snr: 47.3, spread: 0.007 }] },
    { name: 'C1', pc: 'C', oct: '1', strings: 1, hint: 'the lowest C on the piano', offset: '−21',
      below: { name: 'B0', strings: 1 }, above: { name: 'C#1', strings: 1 },
      B: '2.7e-4', pct: 4, risk: '1.2', heard: 'B0', dir: 'one white key to the right',
      fits: [{ n: 12, rmse: 0.10, snr: 47.0, spread: 0.008 }, { n: 12, rmse: 0.09, snr: 47.9, spread: 0.007 }] }
  ];

  /* SPEC §5.2 / InharmonicityFit.swift:171-193 — confidence is the product of the four factors. */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function quality(f) {
    var g = {
      count: clamp01((f.n - 2) / 4),
      rmse: Math.exp(-Math.pow(f.rmse / 0.5, 2)),
      snr: clamp01((f.snr - 20) / 30),
      cons: Math.exp(-Math.pow(f.spread / 0.05, 2))
    };
    g.conf = g.count * g.rmse * g.snr * g.cons;
    return g;
  }
  function qWord(v) { return v >= 0.8 ? 'good' : v >= 0.6 ? 'fair' : 'low'; }   /* QualityBar.swift:31-43 */

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function s(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    return n;
  }
  function icon(kind) {
    var svg = s('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false', 'class': 'rc-wizard__icon' });
    if (kind === 'check') {
      svg.appendChild(s('circle', { cx: 10, cy: 10, r: 7.6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }));
      svg.appendChild(s('path', { d: 'M6.4 10.3l2.5 2.5 4.8-5.3', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    } else if (kind === 'check-fill') {
      svg.appendChild(s('circle', { cx: 10, cy: 10, r: 8.4, fill: 'currentColor' }));
      svg.appendChild(s('path', { d: 'M6.4 10.3l2.5 2.5 4.8-5.3', fill: 'none', stroke: 'var(--surface)', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    } else { /* xmark.octagon */
      svg.appendChild(s('path', { d: 'M6.9 2.4h6.2l4.5 4.5v6.2l-4.5 4.5H6.9l-4.5-4.5V6.9z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
      svg.appendChild(s('path', { d: 'M7.4 7.4l5.2 5.2M12.6 7.4l-5.2 5.2', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round' }));
    }
    return svg;
  }

  /* ---------- Mute diagram (MuteDiagramView.swift; Theme+Measure.swift) ---------- */
  var DG = { W: 336, H: 160, pad: 16, sw: 8, sh: 80, top: 28, nSpace: 24, ownSpace: 64, gap: 40, midY: 68, amp: 10 };

  function buildDiagram(svg, note, stripped) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var g = s('g', { 'class': 'rc-wizard__dg' });
    function xs(first, count, space) { var a = []; for (var i = 0; i < count; i++) a.push(first + i * space); return a; }
    var below = xs(DG.pad, note.below.strings, DG.nSpace);
    var own = xs(below[below.length - 1] + DG.gap, note.strings, DG.ownSpace);
    var above = xs(own[own.length - 1] + DG.gap, note.above.strings, DG.nSpace);
    /* The app left-aligns narrow diagrams in a 260 pt frame; here the content is centred in a constant
       336-wide viewBox so the scale does not change between notes. */
    var dx = Math.round((DG.W - (above[above.length - 1] + DG.pad)) / 2);
    below = below.map(function (x) { return x + dx; }); own = own.map(function (x) { return x + dx; }); above = above.map(function (x) { return x + dx; });
    var bottom = DG.top + DG.sh;

    if (stripped) {
      /* Felt band, drawn under the strings: low across each note, humping up through every gap. */
      var lo = DG.midY + DG.amp, hi = DG.midY - DG.amp, groups = [below, own, above], d = 'M0 ' + lo;
      groups.forEach(function (grp, i) {
        var f = grp[0], l = grp[grp.length - 1];
        if (i > 0) {
          var prev = groups[i - 1], pl = prev[prev.length - 1], gc = (pl + f) / 2;
          d += ' Q' + pl + ' ' + hi + ' ' + gc + ' ' + hi + ' Q' + f + ' ' + lo + ' ' + (f + 12) + ' ' + lo;
        } else d += ' L' + (f + 12) + ' ' + lo;
        d += ' L' + Math.max(f + 12, l - 12) + ' ' + lo;
      });
      d += ' L' + DG.W + ' ' + lo;
      g.appendChild(s('path', { d: d, 'class': 'rc-wizard__felt' }));
      /* Code quirk fixed: the app draws this label on top of "reference"; here it sits at the right end. */
      var fl = s('text', { x: DG.W - 8, y: 20, 'text-anchor': 'end', 'class': 'rc-wizard__cap rc-wizard__cap--warn' });
      fl.textContent = 'felt strip'; g.appendChild(fl);
    }

    function strings(list, cls) {
      list.forEach(function (x) {
        g.appendChild(s('rect', { x: x - DG.sw / 2, y: DG.top, width: DG.sw, height: DG.sh, rx: DG.sw / 2, 'class': cls }));
      });
    }
    function caption(x, y, text, cls) {
      var t = s('text', { x: x, y: y + 4, 'text-anchor': 'middle', 'class': 'rc-wizard__cap' + (cls ? ' ' + cls : '') });
      t.textContent = text; g.appendChild(t);
    }
    strings(below, 'rc-wizard__str rc-wizard__str--nb');
    strings(above, 'rc-wizard__str rc-wizard__str--nb');
    caption((below[0] + below[below.length - 1]) / 2, bottom + 12, note.below.name, 'rc-wizard__cap--nb');
    caption((above[0] + above[above.length - 1]) / 2, bottom + 12, note.above.name, 'rc-wizard__cap--nb');

    /* Default reference string: MIDDLE of three, RIGHT of two, the only one of one. */
    var open = note.strings === 3 ? 1 : note.strings === 2 ? 1 : 0;
    var labels = note.strings === 3 ? ['LEFT', 'MIDDLE', 'RIGHT'] : note.strings === 2 ? ['LEFT', 'RIGHT'] : ['SINGLE'];
    own.forEach(function (x, i) {
      g.appendChild(s('rect', { x: x - DG.sw / 2, y: DG.top, width: DG.sw, height: DG.sh, rx: DG.sw / 2, 'class': 'rc-wizard__str' + (i === open ? ' rc-wizard__str--ref' : '') }));
      caption(x, bottom + 12, labels[i]);
    });
    caption(own[open], DG.top - 12, 'reference', 'rc-wizard__cap--ref');

    if (!stripped) {
      /* Wedge 20 × 28, tip down, in the middle of the 40 pt gap BETWEEN notes; 3 pt round stroke. */
      var wedges = note.strings === 3 ? [own[0] - DG.gap / 2, own[2] + DG.gap / 2] : note.strings === 2 ? [own[0] - DG.gap / 2] : [];
      wedges.forEach(function (cx) {
        g.appendChild(s('polygon', { points: (cx - 10) + ',' + (DG.midY - 14) + ' ' + (cx + 10) + ',' + (DG.midY - 14) + ' ' + cx + ',' + (DG.midY + 14), 'class': 'rc-wizard__wedge' }));
      });
    }
    var foot = s('text', { x: DG.W / 2, y: DG.H - 6, 'text-anchor': 'middle', 'class': 'rc-wizard__foot' });
    foot.textContent = 'as seen from the bench, bass to the left';
    g.appendChild(foot);
    svg.appendChild(g);
  }

  function diagramLabel(note, stripped) {
    var lead = 'Mute diagram for ' + note.name + ', as seen from the bench with the bass to the left. ';
    if (stripped) return lead + 'Three strings under a yellow felt strip that weaves up through the gaps between the notes; only the middle string, in amber, stays open as the reference.';
    if (note.strings === 3) return lead + 'Three strings. Yellow wedges sit in the gap towards ' + note.below.name + ' and in the gap towards ' + note.above.name + ', muting the left and right strings. The middle string, in amber, stays open as the reference.';
    if (note.strings === 2) return lead + 'Two strings. One yellow wedge in the gap towards ' + note.below.name + ' mutes the left string. The right string, in amber, stays open as the reference.';
    return lead + 'One string, in amber, is the reference. No wedge.';
  }

  /* ---------- Component ---------- */
  function mount(el, env) {
    var fb = el.querySelector('.rc-fallback');
    if (fb) fb.parentNode.removeChild(fb);

    var S = { note: 0, method: 'wedges', state: 'ready', t: 0, strikes: 0, result: null, fit: null, pendingWrong: false,
              measured: [false, false, false], auto: true, loop: 0, rejectDone: false, sinceStrike: 1e9, confirmedText: '' };
    var active = false, raf = 0, last = 0, dirtyNote = true, dirtyState = true, destroyed = false, interacted = false;
    var RING_C = 2 * Math.PI * 44;

    /* ----- DOM ----- */
    var root = h('div', 'rc-wizard__root');
    var stage = h('div', 'rc-wizard__stage');
    var card = h('div', 'rc-wizard__card');

    var head = h('div', 'rc-wizard__head');
    var noteBox = h('div', 'rc-wizard__notebox');
    var noteName = h('p', 'rc-wizard__note');
    var pcEl = h('span', 'rc-wizard__pc'), octEl = h('span', 'rc-wizard__oct');
    noteName.appendChild(pcEl); noteName.appendChild(octEl);
    var hintEl = h('p', 'rc-wizard__hint');
    noteBox.appendChild(noteName); noteBox.appendChild(hintEl);

    var ringBox = h('div', 'rc-wizard__ringbox');
    ringBox.setAttribute('role', 'img'); ringBox.setAttribute('aria-live', 'off');
    var ringWrap = h('div', 'rc-wizard__ring');
    var ringSvg = s('svg', { viewBox: '0 0 96 96', 'aria-hidden': 'true', focusable: 'false' });
    ringSvg.appendChild(s('circle', { cx: 48, cy: 48, r: 44, 'class': 'rc-wizard__ring-track' }));
    var ringArc = s('circle', { cx: 48, cy: 48, r: 44, 'class': 'rc-wizard__ring-arc', transform: 'rotate(-90 48 48)', 'stroke-dasharray': RING_C.toFixed(2), 'stroke-dashoffset': RING_C.toFixed(2) });
    ringSvg.appendChild(ringArc);
    var ringCentre = h('div', 'rc-wizard__ring-centre');
    var ringCount = h('span', 'rc-wizard__ring-count', '0');
    ringCentre.appendChild(ringCount); ringCentre.appendChild(h('span', 'rc-wizard__ring-of', 'of 2'));
    ringWrap.appendChild(ringSvg); ringWrap.appendChild(ringCentre);
    var ringLabel = h('p', 'rc-wizard__ring-label');
    ringBox.appendChild(ringWrap); ringBox.appendChild(ringLabel);
    head.appendChild(noteBox); head.appendChild(ringBox);

    var offsetEl = h('p', 'rc-wizard__offset');
    var diagramBox = h('div', 'rc-wizard__diagram'); diagramBox.title = LEFT_DEF;
    var diagram = s('svg', { viewBox: '0 0 ' + DG.W + ' ' + DG.H, role: 'img', focusable: 'false' });
    diagramBox.appendChild(diagram);
    var headline = h('p', 'rc-wizard__headline'); headline.title = LEFT_DEF;
    var rule = h('div', 'rc-wizard__rule'); rule.setAttribute('aria-hidden', 'true');
    var says = h('div', 'rc-wizard__says'); says.setAttribute('aria-live', 'off');
    var nextEl = h('p', 'rc-wizard__next');
    var chips = h('ul', 'rc-wizard__chips'); chips.setAttribute('aria-label', 'Planner batch');
    [head, offsetEl, diagramBox, headline, rule, says, nextEl, chips].forEach(function (n) { card.appendChild(n); });

    /* Side: simulated input level + Quality card */
    var side = h('div', 'rc-wizard__side');
    var level = h('div', 'rc-wizard__level');
    var keyGlyph = h('span', 'rc-wizard__key'); keyGlyph.setAttribute('aria-hidden', 'true'); keyGlyph.appendChild(h('i'));
    var levelLabel = h('span', 'rc-wizard__level-label', 'Simulated input');
    var meter = h('span', 'rc-wizard__meter'); meter.setAttribute('aria-hidden', 'true');
    var meterFill = h('i', 'rc-wizard__meter-fill'); var meterTick = h('i', 'rc-wizard__meter-tick');
    meter.appendChild(meterFill); meter.appendChild(meterTick);
    level.appendChild(keyGlyph); level.appendChild(levelLabel); level.appendChild(meter);

    var qCard = h('div', 'rc-wizard__card rc-wizard__quality');
    qCard.setAttribute('role', 'img'); qCard.setAttribute('aria-live', 'off');
    var qHead = h('div', 'rc-wizard__q-head');
    qHead.appendChild(h('p', 'rc-wizard__q-title', 'Quality'));
    var qConf = h('p', 'rc-wizard__q-conf'); qHead.appendChild(qConf);
    var qMain = h('div', 'rc-wizard__bar rc-wizard__bar--main');
    var qMainFill = h('i', 'rc-wizard__bar-fill'); qMain.appendChild(qMainFill);
    qMain.appendChild(h('i', 'rc-wizard__tick rc-wizard__tick--amber')); qMain.appendChild(h('i', 'rc-wizard__tick rc-wizard__tick--green'));
    var qGrid = h('div', 'rc-wizard__q-grid'), segs = {};
    [['count', 'partials'], ['rmse', 'fit RMSE'], ['snr', 'SNR'], ['cons', 'consistency']].forEach(function (p) {
      var bar = h('div', 'rc-wizard__bar'), fill = h('i', 'rc-wizard__bar-fill'), det = h('span', 'rc-wizard__q-detail', '—');
      bar.appendChild(fill);
      qGrid.appendChild(h('span', 'rc-wizard__q-name', p[1])); qGrid.appendChild(bar); qGrid.appendChild(det);
      segs[p[0]] = { fill: fill, det: det };
    });
    qCard.appendChild(qHead); qCard.appendChild(qMain); qCard.appendChild(qGrid);
    side.appendChild(level); side.appendChild(qCard);

    /* Site controls (not part of the app's card) */
    var controls = h('div', 'rc-wizard__controls');
    function segmented(label, options, onPick) {
      var grp = h('div', 'rc-wizard__seg'); grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', label);
      var btns = options.map(function (o) {
        var b = h('button', 'rc-wizard__seg-btn', o.label); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function () { onPick(o.value); });
        grp.appendChild(b); return { el: b, value: o.value };
      });
      return { el: grp, set: function (v) { btns.forEach(function (b) { b.el.setAttribute('aria-pressed', b.value === v ? 'true' : 'false'); }); } };
    }
    var methodSeg = segmented('Muting method', [{ label: 'Wedges', value: 'wedges' }, { label: 'Felt strip', value: 'strip' }], pickMethod);
    var noteSeg = segmented('Strings on the note', [{ label: '3 strings', value: 0 }, { label: '2 strings', value: 1 }, { label: '1 string', value: 2 }], pickNote);
    var rowA = h('div', 'rc-wizard__row'); rowA.appendChild(methodSeg.el); rowA.appendChild(noteSeg.el);
    var rowB = h('div', 'rc-wizard__row');
    var strikeBtn = h('button', 'rc-wizard__btn rc-wizard__btn--primary', 'Strike'); strikeBtn.type = 'button';
    var wrongBtn = h('button', 'rc-wizard__btn', 'Strike the wrong key'); wrongBtn.type = 'button';
    var demoBtn = h('button', 'rc-wizard__btn rc-wizard__btn--ghost', 'Pause demo'); demoBtn.type = 'button';
    rowB.appendChild(strikeBtn); rowB.appendChild(wrongBtn); rowB.appendChild(demoBtn);
    var tip = h('p', 'rc-wizard__tip');
    var live = h('p', 'visually-hidden'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    controls.appendChild(rowA); controls.appendChild(rowB); controls.appendChild(tip); controls.appendChild(live);

    stage.appendChild(card); stage.appendChild(side);
    root.appendChild(stage); root.appendChild(controls);
    el.appendChild(root);

    /* ----- State machine (WizardRunner.swift) ----- */
    function rm() { return !!env.reduceMotion; }
    function note() { return NOTES[S.note]; }
    function stripped() { return S.method === 'strip' && note().strings === 3; }   /* strip range C3–C5, trichords only */
    function setState(st) { S.state = st; S.t = 0; dirtyState = true; }

    function enterNote(i) {
      S.note = i; S.strikes = 0; S.result = null; S.fit = null; S.pendingWrong = false; S.confirmedText = ''; S.sinceStrike = 1e9;
      setState(rm() ? 'armed' : 'ready');
      dirtyNote = true;
    }
    function canStrike() { return S.state === 'armed' || S.state === 'result'; }   /* onsets are taken in ARMED or RESULT */
    function strike(wrong) {
      if (!canStrike()) return false;
      S.pendingWrong = !!wrong; S.sinceStrike = 0;
      if (rm()) resolve(); else setState('listening');
      return true;
    }
    function nextTail() {
      var nx = NOTES[S.note + 1];
      if (!nx) return 'Batch complete.';
      if (S.method === 'strip' && nx.strings === 3) return 'Next: ' + nx.name + ' — it is under the strip, no mutes to move';
      if (nx.strings === 3) return 'Next: ' + nx.name + ' — move both mutes to ' + nx.name;
      if (nx.strings === 2) return 'Next: ' + nx.name + ' — move the mute to ' + nx.name;
      return 'Next: ' + nx.name + ' — no mute needed';
    }
    function resolve() {
      var n = note();
      if (S.pendingWrong) {           /* wrong key: strike discarded, nothing stored, count unchanged */
        S.pendingWrong = false; S.result = 'wrong'; setState('result'); return;
      }
      S.strikes += 1; S.fit = n.fits[Math.min(S.strikes, n.fits.length) - 1];
      if (S.strikes >= 2) {           /* two strikes agree → the runner confirms by itself */
        S.result = 'agreed'; S.measured[S.note] = true; dirtyNote = true;
        S.confirmedText = n.name + ' measured: B = ' + n.B + ' (±' + n.pct + ' %). ' + nextTail();
        setState('confirmed');
      } else { S.result = 'good'; setState('result'); }
    }
    function advance() {
      var nx = (S.note + 1) % NOTES.length;
      if (nx === 0) {
        S.loop += 1; S.measured = [false, false, false]; S.rejectDone = false;
        if (S.auto) { S.method = S.loop % 2 ? 'strip' : 'wedges'; }
      }
      enterNote(nx);
    }
    function autoStrike() {
      var wrong = S.note === 0 && !S.rejectDone && S.strikes === 0;   /* one rejection per loop */
      if (wrong) S.rejectDone = true;
      strike(wrong);
    }
    function step(dt) {
      S.t += dt; S.sinceStrike += dt;
      switch (S.state) {
        case 'ready': if (S.t >= T_READY) setState('armed'); break;
        case 'armed': if (S.auto && S.t >= AUTO_ARMED) autoStrike(); break;
        case 'listening': if (S.t >= T_LISTEN) setState('analysing'); break;
        case 'analysing': if (S.t >= T_ANALYSE) resolve(); break;
        case 'result': if (S.auto && S.t >= (S.result === 'wrong' ? AUTO_REJECTED : AUTO_RESULT)) autoStrike(); break;
        case 'confirmed': if (S.t >= T_CONFIRMED) advance(); break;
      }
    }

    /* ----- Rendering (only on change; never from measurements of layout) ----- */
    function swap(parent, nodes) {   /* new nodes fade in (CSS animation, 200 ms) */
      while (parent.firstChild) parent.removeChild(parent.firstChild);
      nodes.forEach(function (n) { parent.appendChild(n); });
    }
    function renderNote() {
      var n = note();
      pcEl.textContent = n.pc; octEl.textContent = n.oct;
      noteName.setAttribute('aria-label', n.name);
      hintEl.textContent = n.hint;
      offsetEl.textContent = n.name + ' is currently about ' + n.offset + '¢';
      buildDiagram(diagram, n, stripped());
      diagram.setAttribute('aria-label', diagramLabel(n, stripped()));
      swap(headline, [h('span', 'rc-wizard__in', stripped() ? HEADLINE.strip : HEADLINE[n.strings])]);
      var nx = NOTES[S.note + 1];
      nextEl.textContent = nx ? 'Next: ' + nx.name + ' (risk ' + nx.risk + '¢)' : 'Next: —';
      nextEl.classList.toggle('is-empty', !nx);
      swap(chips, NOTES.map(function (b, i) {
        var li = h('li', 'rc-wizard__chip' + (i === S.note ? ' is-current' : S.measured[i] ? ' is-measured' : ''),
          (i + 1) + ' ' + b.name + (S.measured[i] ? ' ✓' : ' ' + b.risk + '¢'));
        if (i === S.note) li.setAttribute('aria-current', 'true');
        return li;
      }));
      methodSeg.set(S.method); noteSeg.set(S.note);
    }

    var RING = {
      ready: ['Ready', 'text-2'], armed: ['Armed — strike when ready', 'accent'], listening: ['Keep holding…', 'reference'],
      analysing: ['Analysing…', 'accent'], result: ['Result', 'in-tune'], confirmed: ['Measured', 'in-tune']
    };
    function line(cls, kind, text) {
      var p = h('p', 'rc-wizard__line ' + cls);
      if (kind) p.appendChild(icon(kind));
      p.appendChild(h('span', null, text));
      return p;
    }
    function renderState() {
      var n = note(), st = S.state, ring = RING[st];
      var colour = st === 'result' && S.result === 'wrong' ? 'sharp' : ring[1];
      ringBox.style.setProperty('--ring', 'var(--' + colour + ')');
      ringBox.classList.toggle('is-listening', st === 'listening');
      ringLabel.textContent = ring[0];
      ringCount.textContent = String(S.strikes);
      ringBox.setAttribute('aria-label', ring[0] + ', strike ' + S.strikes + ' of 2');

      var lines = [], spoken = '';
      if (st === 'ready' || st === 'armed') lines.push(line('rc-wizard__line--strike', null, STRIKE_TEXT));
      else if (st === 'listening') lines.push(line('rc-wizard__line--listen', null, 'Keep holding…'));
      else if (st === 'analysing') lines.push(line('rc-wizard__line--analyse', null, 'Analysing…'));
      else {
        lines.push(line('rc-wizard__line--demoted', null, STRIKE_TEXT));
        if (S.result === 'wrong') {
          spoken = 'That sounded like ' + n.heard + ', not ' + n.name + '. ' + n.name + ' is ' + n.dir + '.';
          lines.push(line('rc-wizard__line--red', 'x', spoken));
        } else {
          spoken = S.result === 'agreed' ? AGREED_TEXT : GOOD_TEXT;
          lines.push(line('rc-wizard__line--green', 'check', spoken));
        }
        if (st === 'confirmed') { lines.push(line('rc-wizard__line--green', 'check-fill', S.confirmedText)); spoken += ' ' + S.confirmedText; }
      }
      swap(says, lines);

      /* QualityBar: the last ACCEPTED strike's fit; a discarded strike leaves it untouched. */
      var q = S.fit ? quality(S.fit) : null;
      function paint(fill, v) { fill.style.transform = 'scaleX(' + (q ? v.toFixed(4) : 0) + ')'; fill.style.background = 'var(--' + (v >= 0.8 ? 'in-tune' : v >= 0.6 ? 'warn' : 'sharp') + ')'; }
      paint(qMainFill, q ? q.conf : 0); paint(segs.count.fill, q ? q.count : 0); paint(segs.rmse.fill, q ? q.rmse : 0);
      paint(segs.snr.fill, q ? q.snr : 0); paint(segs.cons.fill, q ? q.cons : 0);
      if (q) {
        qConf.textContent = 'confidence ' + q.conf.toFixed(2) + ' · ' + qWord(q.conf);
        qConf.style.color = 'var(--' + (q.conf >= 0.8 ? 'in-tune' : q.conf >= 0.6 ? 'warn' : 'sharp') + ')';
        segs.count.det.textContent = S.fit.n + ' found';
        segs.rmse.det.textContent = S.fit.rmse.toFixed(2) + '¢';
        segs.snr.det.textContent = Math.round(S.fit.snr) + ' dB';
        segs.cons.det.textContent = 'segments agree';
        qCard.setAttribute('aria-label', 'Measurement quality ' + qWord(q.conf) + ': confidence ' + q.conf.toFixed(2) + '. Partials, ' + S.fit.n + ' found. Fit error ' + S.fit.rmse.toFixed(2) + ' cents. Signal to noise ' + Math.round(S.fit.snr) + ' decibels. Consistency: segments agree.');
      } else {
        qConf.textContent = 'no strike yet'; qConf.style.color = '';
        ['count', 'rmse', 'snr', 'cons'].forEach(function (k) { segs[k].det.textContent = '—'; });
        qCard.setAttribute('aria-label', 'Measurement quality: no strike yet.');
      }

      keyGlyph.classList.toggle('is-down', st === 'listening');
      var ok = canStrike() || (rm() && st === 'confirmed');
      strikeBtn.textContent = rm() && st === 'confirmed' ? 'Next note' : 'Strike';
      strikeBtn.setAttribute('aria-disabled', ok ? 'false' : 'true');
      wrongBtn.setAttribute('aria-disabled', canStrike() ? 'false' : 'true');
      demoBtn.hidden = rm();
      demoBtn.textContent = S.auto ? 'Pause demo' : 'Resume demo';

      var t;
      if (S.method === 'strip' && n.strings !== 3) t = 'The felt strip only runs through the three-string section; on this note the app still asks for ' + (n.strings === 2 ? 'a wedge.' : 'nothing.');
      else if (S.auto && !rm()) t = 'Demo running on illustrative values. Press Strike to take over.';
      else if (st === 'ready') t = 'The wizard arms itself after half a second of quiet.';
      else if (st === 'confirmed') t = rm() ? 'Measured. Press Next note to move on.' : 'Measured. The wizard moves to the next note by itself.';
      else if (canStrike()) t = S.strikes === 0 ? 'Your turn: press Strike. Two strikes must agree.' : 'Press Strike once more to confirm.';
      else t = 'Listening to the simulated strike…';
      tip.textContent = t;
      if (interacted && (!S.auto || rm())) { if (spoken) live.textContent = spoken; else if (st === 'armed') live.textContent = n.name + ': ' + RING.armed[0]; }
    }

    /* Per-frame paint: ring arc + level bar. Style writes only, skipped when unchanged. */
    var lastOff = -1, lastLvl = -1;
    function paintFrame() {
      var p = S.state === 'listening' ? clamp01(S.t / T_LISTEN) : (S.state === 'ready' || S.state === 'armed') ? 0 : 1;
      var off = Math.round(RING_C * (1 - p) * 10) / 10;
      if (off !== lastOff) { lastOff = off; ringArc.setAttribute('stroke-dashoffset', off); ringArc.style.opacity = p > 0.002 ? 1 : 0; }
      /* LevelMeterView: −60…0 dBFS, green, target mark at −12 dBFS. Strike peaks at −12 and decays. */
      var db = rm() ? -60 : Math.max(-57, -12 - 17 * S.sinceStrike);
      var lvl = Math.round(clamp01((db + 60) / 60) * 500) / 500;
      if (lvl !== lastLvl) { lastLvl = lvl; meterFill.style.transform = 'scaleX(' + lvl + ')'; }
    }
    function flush() {
      if (dirtyNote) { dirtyNote = false; renderNote(); }
      if (dirtyState) { dirtyState = false; renderState(); }
      paintFrame();
    }

    /* ----- Loop ----- */
    function frame(now) {
      raf = 0;
      if (!active || rm() || destroyed) return;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      step(dt); flush();
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && active && !rm() && !destroyed) { last = 0; raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

    /* ----- Interaction ----- */
    function takeOver() { interacted = true; if (S.auto) { S.auto = false; dirtyState = true; } }   /* the status region only speaks once the visitor drives */
    function pickMethod(v) {
      takeOver(); S.method = v; dirtyNote = true; dirtyState = true;
      if (v === 'strip' && note().strings !== 3) enterNote(0);   /* the strip only concerns trichords: show one */
      flush();
    }
    function pickNote(i) { takeOver(); S.measured[i] = false; enterNote(i); flush(); }
    strikeBtn.addEventListener('click', function () {
      takeOver();
      if (rm() && S.state === 'confirmed') advance(); else strike(false);
      flush();
    });
    wrongBtn.addEventListener('click', function () { takeOver(); strike(true); flush(); });
    demoBtn.addEventListener('click', function () {
      S.auto = !S.auto; dirtyState = true;
      if (S.auto) live.textContent = '';
      flush();
    });

    /* Static, meaningful state for reduced motion: C3 after a first good strike. */
    function presetStatic() {
      S.auto = false; S.method = 'wedges'; S.measured = [false, false, false];
      enterNote(0); S.strikes = 1; S.fit = NOTES[0].fits[0]; S.result = 'good'; setState('result');
    }
    function reset() {
      S.auto = true; S.loop = 0; S.method = 'wedges'; S.measured = [false, false, false]; S.rejectDone = false;
      enterNote(0);
    }
    env.onReduceMotionChange(function (on) {
      if (destroyed) return;
      if (on) { stop(); presetStatic(); } else { reset(); start(); }
      flush();
    });

    /* Responsive: class switches from the observed width (no layout reads in the loop). */
    var ro = null;
    function applyWidth(w) { root.classList.toggle('is-narrow', w < 460); root.classList.toggle('is-wide', w >= 860); }
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(function (entries) { applyWidth(entries[0].contentRect.width); });
      ro.observe(el);
    }
    applyWidth(el.clientWidth || 600);

    if (rm()) presetStatic(); else reset();
    flush();

    return {
      setActive: function (on) { active = !!on; if (active) start(); else stop(); },
      /* Dev harness: fast-forward the autoplay timeline to t seconds. */
      seek: function (t) {
        if (rm()) return;
        reset();
        for (var i = 0, n = Math.round(t * 60); i < n; i++) step(1 / 60);
        dirtyNote = dirtyState = true; flush(); last = 0;
      },
      destroy: function () { destroyed = true; stop(); if (ro) ro.disconnect(); if (root.parentNode) root.parentNode.removeChild(root); }
    };
  }

  window.ResonanceComponents = window.ResonanceComponents || {};
  window.ResonanceComponents.wizard = mount;
})();
