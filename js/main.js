/* main.js — page shell: entrance after the intro, nav state, scroll reveals, section spy,
   mobile sticky CTA, "Replay intro", and lazy mounting of the live instruments (js/components/*). */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Entrance: the hero comes in as the intro dissolves (or at once when the intro is skipped). */
  function enter() { requestAnimationFrame(function () { root.classList.add('is-entered'); }); }
  function enterWhenReady() {
    if (window.ResonanceIntro && window.ResonanceIntro.active) document.addEventListener('resonance:intro-done', enter, { once: true });
    else enter();
  }
  if (window.ResonanceGate && window.ResonanceGate.locked) document.addEventListener('resonance:unlocked', function () { setTimeout(enterWhenReady, 0); }, { once: true });
  else enterWhenReady();

  /* Nav background once the page has moved. */
  var nav = document.querySelector('.nav');
  function paintNav() { if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 24); }
  window.addEventListener('scroll', paintNav, { passive: true });
  paintNav();

  /* Scroll reveals. */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(reveals, function (n) { io.observe(n); });
  } else {
    Array.prototype.forEach.call(reveals, function (n) { n.classList.add('is-in'); });
  }
  document.addEventListener('focusin', function (e) {       // never leave a focused control invisible
    var r = e.target.closest && e.target.closest('.reveal'); if (r) r.classList.add('is-in');
  });

  /* Section spy for the nav links. A section lights the link named in its data-nav (default: its own id);
     data-nav="" lights none. */
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav__links a[href^="#"]'));
  var spied = document.querySelectorAll('main > section[id]');
  if ('IntersectionObserver' in window && links.length && spied.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var key = e.target.dataset.nav != null ? e.target.dataset.nav : e.target.id;
        links.forEach(function (a) {
          if (key && a.getAttribute('href') === '#' + key) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Array.prototype.forEach.call(spied, function (t) { spy.observe(t); });
  }

  /* Sticky copy columns: tell CSS how tall each one is, so a tall column pins by its bottom edge. */
  if ('ResizeObserver' in window) {
    var copyRO = new ResizeObserver(function (entries) {
      entries.forEach(function (e) { e.target.style.setProperty('--copy-h', Math.ceil(e.target.offsetHeight) + 'px'); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.split > .split__copy'), function (n) { copyRO.observe(n); });
  }

  /* Long equations scroll sideways on phones: fade the edge while there is more to see. */
  Array.prototype.forEach.call(document.querySelectorAll('.rc-maths__formula'), function (f) {
    var paint = function () { f.classList.toggle('is-clipped', f.scrollWidth - f.clientWidth - f.scrollLeft > 2); };
    f.addEventListener('scroll', paint, { passive: true });
    window.addEventListener('resize', paint);
    paint();
  });

  /* Mobile sticky CTA: shown once the hero's own CTA has scrolled away, hidden again at the footer CTA. */
  var sticky = document.querySelector('.sticky-cta');
  var heroCta = document.querySelector('[data-hero-cta]');
  var finalCta = document.querySelector('[data-final-cta]');
  if (sticky && heroCta && 'IntersectionObserver' in window) {
    var heroGone = false, finalSeen = false;
    var paintSticky = function () { sticky.classList.toggle('is-visible', heroGone && !finalSeen); };
    new IntersectionObserver(function (en) { heroGone = !en[0].isIntersecting && en[0].boundingClientRect.top < 0; paintSticky(); }).observe(heroCta);
    if (finalCta) new IntersectionObserver(function (en) { finalSeen = en[0].isIntersecting; paintSticky(); }).observe(finalCta);
  }

  /* "Replay intro" in the footer. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-replay-intro]'), function (b) {
    b.addEventListener('click', function () {
      if (!window.ResonanceIntro) return;
      if (window.ResonanceFilm) window.ResonanceFilm.pause();
      window.ResonanceIntro.replay();
    });
  });

  /* "Get the app" in the nav: straight to the visitor's own store; anyone else goes to the download section. */
  if (!root.classList.contains('is-ios') && !root.classList.contains('is-mac')) {    // sub-pages have no head bootstrap
    var ua = navigator.userAgent || '';
    if (/iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) root.classList.add('is-ios');
    else if (/Macintosh/.test(ua)) root.classList.add('is-mac');
  }
  var ownStore = root.classList.contains('is-ios') ? 'ios' : root.classList.contains('is-mac') ? 'mac' : '';
  var storeUrls = { ios: 'https://apps.apple.com/us/app/resonance-piano-tuner/id6752103381', mac: 'https://apps.apple.com/us/app/resonance-piano-tuner/id6752103374?mt=12' };
  if (ownStore) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-appstore="auto"]'), function (a) { a.href = storeUrls[ownStore]; });
  }

  /* Share sheet on touch devices: "send this to my Mac" (AirDrop, Messages, Notes …). */
  Array.prototype.forEach.call(document.querySelectorAll('[data-share]'), function (b) {
    if (!navigator.share || !window.matchMedia('(pointer: coarse)').matches) return;
    b.hidden = false;
    b.addEventListener('click', function () {
      navigator.share({ title: document.title, text: 'Resonance Piano Tuner for Mac', url: b.dataset.share || location.href }).catch(function () {});
    });
  });

  /* Live instruments: each [data-component] is mounted at load and told when it is on screen, so
     nothing animates out of sight. Contract — js/components/<name>.js registers
       window.ResonanceComponents[name] = function mount(el, env) { return { setActive(bool), destroy() } }
     env = { reduceMotion: bool, tokens: {cssVarName: value}, onReduceMotionChange(fn) } */
  var registry = window.ResonanceComponents = window.ResonanceComponents || {};
  var tokenNames = ['bg', 'surface', 'surface-2', 'text', 'text-2', 'dim', 'hairline', 'accent', 'reference', 'flat', 'sharp', 'in-tune', 'warn', 'measured', 'raised', 'white-key', 'black-key', 'copper'];
  var cs = getComputedStyle(root), tokens = {};
  tokenNames.forEach(function (n) { tokens[n] = cs.getPropertyValue('--' + n).trim(); });
  var rmListeners = [];
  var env = {
    get reduceMotion() { return reduceMotion.matches; },
    tokens: tokens,
    fonts: { ui: cs.getPropertyValue('--font-ui').trim(), mono: cs.getPropertyValue('--font-mono').trim(), display: cs.getPropertyValue('--font-display').trim() },
    onReduceMotionChange: function (fn) { rmListeners.push(fn); }
  };
  var onRM = function () { rmListeners.forEach(function (fn) { fn(reduceMotion.matches); }); };
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onRM); else if (reduceMotion.addListener) reduceMotion.addListener(onRM);

  var mounted = new WeakMap();
  function mount(el) {
    if (mounted.has(el)) return mounted.get(el);
    var fn = registry[el.dataset.component];
    if (typeof fn !== 'function') return null;
    var api = null;
    try { api = fn(el, env) || {}; } catch (err) { console.error('[resonance] component "' + el.dataset.component + '" failed to mount', err); api = {}; }
    mounted.set(el, api); el.classList.add('is-mounted');
    return api;
  }
  var comps = document.querySelectorAll('[data-component]');
  // Mount everything up front (building the DOM is cheap) so in-page links never land on a layout
  // that is about to grow; only the animation is tied to visibility.
  Array.prototype.forEach.call(comps, mount);
  if ('IntersectionObserver' in window) {
    var onScreen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var api = mounted.get(e.target);
        if (api && api.setActive) api.setActive(e.isIntersecting && !document.hidden);
      });
    }, { threshold: 0.12 });
    Array.prototype.forEach.call(comps, function (el) { onScreen.observe(el); });
    document.addEventListener('visibilitychange', function () {
      Array.prototype.forEach.call(comps, function (el) {
        var api = mounted.get(el); if (!api || !api.setActive) return;
        var r = el.getBoundingClientRect();
        api.setActive(!document.hidden && r.bottom > 0 && r.top < window.innerHeight);
      });
    });
  } else {
    Array.prototype.forEach.call(comps, function (el) { var api = mounted.get(el); if (api && api.setActive) api.setActive(true); });
  }
})();
