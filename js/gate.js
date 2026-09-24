/* gate.js — a password in front of the private preview. Loaded synchronously in <head> on every page.
   This is a curtain, not security: the password is right here in the source, on purpose.
   Once entered it is remembered in this browser (localStorage), so every page opens after that. */
(function () {
  'use strict';

  var PASSWORD = 'mango';
  var KEY = 'resonance.gate';
  var root = document.documentElement;
  var open = false;
  try { open = localStorage.getItem(KEY) === 'open'; } catch (_) {}
  if (!open) root.classList.add('is-locked');

  function unlock(gate) {
    try { localStorage.setItem(KEY, 'open'); } catch (_) {}
    root.classList.remove('is-locked');
    api.locked = false;
    gate.classList.add('is-leaving');
    setTimeout(function () { gate.remove(); }, 450);
    document.dispatchEvent(new CustomEvent('resonance:unlocked'));
  }

  function mount() {
    if (open || document.querySelector('.gate')) return;
    var gate = document.createElement('div');
    gate.className = 'gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'gate-title');
    gate.innerHTML =
      '<form class="gate__card" novalidate>' +
        '<span class="gate__mark" aria-hidden="true"><span class="gate__name">RESONANCE</span><span class="string-mark"></span></span>' +
        '<h1 class="gate__title" id="gate-title">A private preview</h1>' +
        '<p class="gate__text">Enter the password to have a look.</p>' +
        '<label class="visually-hidden" for="gate-input">Password</label>' +
        '<div class="gate__row">' +
          '<input class="gate__input" id="gate-input" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" placeholder="Password" required>' +
          '<button class="btn btn--amber gate__btn" type="submit">Enter</button>' +
        '</div>' +
        '<p class="gate__error" role="alert" aria-live="assertive"></p>' +
      '</form>';
    document.body.insertBefore(gate, document.body.firstChild);
    var form = gate.querySelector('form'), input = gate.querySelector('input'), error = gate.querySelector('.gate__error');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (input.value.trim().toLowerCase() === PASSWORD) { unlock(gate); return; }
      error.textContent = input.value ? 'That’s not it. Try again.' : 'Type the password first.';
      form.classList.remove('is-wrong'); void form.offsetWidth; form.classList.add('is-wrong');
      input.select();
    });
    input.addEventListener('input', function () { error.textContent = ''; });
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
  }

  var api = window.ResonanceGate = { locked: !open, mount: mount };
})();
