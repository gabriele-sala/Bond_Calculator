// Scelta del tema (automatico, chiaro, scuro) e della palette di colori.
// La preferenza è salvata nel browser; lo script nell'intestazione la applica
// prima del primo disegno, questo file gestisce i controlli.
(function () {
  'use strict';

  const KEY = 'bondcalc:aspetto';
  const PALETTES = ['verde', 'blu', 'ambra', 'grafite'];
  const root = document.documentElement;
  // In modalità automatica il sito non tocca data-theme, che può essere impostato da chi
  // ospita la pagina. Quando l'utente sceglie chiaro o scuro si ricorda il valore
  // precedente, per ripristinarlo se torna su automatico.
  let previousTheme = 'BOND_HOST_THEME' in window ? window.BOND_HOST_THEME : root.getAttribute('data-theme');
  let overriding = root.hasAttribute('data-theme') && previousTheme !== root.getAttribute('data-theme');

  function read() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    } catch (e) { /* archiviazione non disponibile */ }
    return {
      mode: saved.mode === 'light' || saved.mode === 'dark' ? saved.mode : 'auto',
      palette: PALETTES.includes(saved.palette) ? saved.palette : 'verde',
    };
  }

  function write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* archiviazione non disponibile */ }
  }

  // Colore della barra del browser sui telefoni.
  function updateThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
  }

  function apply(state) {
    if (state.mode !== 'auto') {
      if (!overriding) {
        previousTheme = root.getAttribute('data-theme');
        overriding = true;
      }
      root.setAttribute('data-theme', state.mode);
    } else if (overriding) {
      if (previousTheme) root.setAttribute('data-theme', previousTheme);
      else root.removeAttribute('data-theme');
      overriding = false;
    }
    if (state.palette === 'verde') root.removeAttribute('data-palette');
    else root.setAttribute('data-palette', state.palette);
    updateThemeColor();
  }

  const state = read();
  const modeInput = document.getElementById('tema-' + { auto: 'auto', light: 'chiaro', dark: 'scuro' }[state.mode]);
  const paletteInput = document.getElementById('colore-' + state.palette);
  if (modeInput) modeInput.checked = true;
  if (paletteInput) paletteInput.checked = true;
  apply(state);

  document.querySelectorAll('input[name="tema"]').forEach((el) =>
    el.addEventListener('change', () => {
      state.mode = el.value;
      write(state);
      apply(state);
    })
  );
  document.querySelectorAll('input[name="colore"]').forEach((el) =>
    el.addEventListener('change', () => {
      state.palette = el.value;
      write(state);
      apply(state);
    })
  );
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeColor);
  } catch (e) { /* browser datati */ }
})();
