// Scelta del tema (automatico, chiaro, scuro) e della palette di colori.
// La preferenza è salvata nel browser; lo script nell'intestazione la applica
// prima del primo disegno, questo file gestisce i controlli.
(function () {
  'use strict';

  const KEY = 'bondcalc:aspetto';
  const PALETTES = ['verde', 'blu', 'ambra', 'grafite'];
  const MODE_ID = { auto: 'auto', light: 'chiaro', dark: 'scuro' };
  const root = document.documentElement;

  // In modalità automatica il sito non tocca data-theme, che può essere impostato da chi
  // ospita la pagina. hostTheme è l'ultimo valore deciso dall'host, da ripristinare
  // quando l'utente torna su automatico dopo aver scelto chiaro o scuro.
  let hostTheme = 'BOND_HOST_THEME' in window ? window.BOND_HOST_THEME : root.getAttribute('data-theme');

  function read() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    } catch (e) { /* archiviazione non disponibile o dato non valido */ }
    return {
      mode: saved.mode === 'light' || saved.mode === 'dark' ? saved.mode : 'auto',
      palette: PALETTES.includes(saved.palette) ? saved.palette : 'verde',
    };
  }

  // Salva solo il campo cambiato, per non cancellare quanto scelto in un'altra scheda.
  function save(change) {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.assign(read(), change)));
    } catch (e) { /* archiviazione non disponibile */ }
  }

  // Colore della barra del browser sui telefoni.
  function updateThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
  }

  function setThemeAttribute(value) {
    if (root.getAttribute('data-theme') === value) return;
    if (value) root.setAttribute('data-theme', value);
    else root.removeAttribute('data-theme');
  }

  function apply() {
    setThemeAttribute(state.mode === 'auto' ? hostTheme : state.mode);
    if (state.palette === 'verde') root.removeAttribute('data-palette');
    else root.setAttribute('data-palette', state.palette);
    updateThemeColor();
  }

  function syncControls() {
    const mode = document.getElementById('tema-' + MODE_ID[state.mode]);
    const palette = document.getElementById('colore-' + state.palette);
    if (mode) mode.checked = true;
    if (palette) palette.checked = true;
  }

  const state = read();
  syncControls();
  apply();

  document.querySelectorAll('input[name="tema"]').forEach((el) =>
    el.addEventListener('change', () => {
      state.mode = el.value;
      save({ mode: state.mode });
      apply();
    })
  );
  document.querySelectorAll('input[name="colore"]').forEach((el) =>
    el.addEventListener('change', () => {
      state.palette = el.value;
      save({ palette: state.palette });
      apply();
    })
  );

  // Cambi di data-theme fatti dall'host dopo il caricamento: in automatico si seguono,
  // con chiaro o scuro scelti dall'utente si ricordano ma vince la scelta dell'utente.
  new MutationObserver(() => {
    const current = root.getAttribute('data-theme');
    if (state.mode === 'auto') hostTheme = current;
    else if (current !== state.mode) {
      hostTheme = current;
      setThemeAttribute(state.mode);
    }
    updateThemeColor();
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // Scelte fatte in un'altra scheda aperta sul sito.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    Object.assign(state, read());
    syncControls();
    apply();
  });

  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeColor);
  } catch (e) { /* browser datati */ }
})();
