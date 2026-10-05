/*
 * Link condivisibile di un'analisi: i dati del calcolatore viaggiano nella
 * query string, senza account né server. Contiene solo i parametri del
 * titolo e della simulazione, nessun dato personale.
 *
 * Funziona sia nel browser (globale `Share`) sia in Node (`require`).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Share = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const NUM = /^-?\d+(\.\d+)?$/;
  const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

  // Parametro dell'URL -> campo dell'analisi, con la regola di validazione.
  const PARAMS = [
    ['isin', 'isin', (v) => ISIN.test(v)],
    ['regolamento', 'settlement', (v) => DATE.test(v)],
    ['scadenza', 'maturity', (v) => DATE.test(v)],
    ['cedola', 'coupon', (v) => NUM.test(v)],
    ['frequenza', 'freq', (v) => ['1', '2', '4', '12'].includes(v)],
    ['giorni', 'daycount', (v) => ['ACT/ACT', '30/360', '30E/360', 'ACT/360', 'ACT/365'].includes(v)],
    ['rimborso', 'redemption', (v) => NUM.test(v)],
    ['modo', 'mode', (v) => v === 'price' || v === 'yield'],
    ['prezzo', 'price', (v) => NUM.test(v)],
    ['rendimento', 'yield', (v) => NUM.test(v)],
    ['base', 'yieldbasis', (v) => v === 'eff' || v === 'nom'],
    ['nominale', 'nominal', (v) => NUM.test(v)],
    ['commissioni', 'commission', (v) => NUM.test(v)],
    ['tassa', 'tax', (v) => NUM.test(v)],
    ['bollo', 'stamp', (v) => v === '1' || v === '0'],
    ['call', 'calldate', (v) => DATE.test(v)],
    ['prezzocall', 'callprice', (v) => NUM.test(v)],
  ];

  /**
   * Dati dell'analisi -> query string. Valori in formato tecnico: numeri con il
   * punto decimale, date AAAA-MM-GG. I campi vuoti o assenti non vengono scritti.
   */
  function encode(state) {
    const q = new URLSearchParams();
    for (const [param, field] of PARAMS) {
      let v = state[field];
      if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) continue;
      if (typeof v === 'boolean') v = v ? '1' : '0';
      q.set(param, String(v));
    }
    return q.toString();
  }

  /**
   * Query string -> dati dell'analisi. Ignora i parametri sconosciuti o non
   * validi; restituisce null se il link non contiene un'analisi.
   */
  function decode(search) {
    const q = new URLSearchParams(search || '');
    const out = {};
    let found = 0;
    for (const [param, field, valid] of PARAMS) {
      const v = (q.get(param) || '').trim();
      if (!v || !valid(v)) continue;
      out[field] = field === 'stamp' ? v === '1' : field === 'isin' || field === 'settlement' || field === 'maturity' || field === 'calldate' || field === 'freq' || field === 'daycount' || field === 'mode' || field === 'yieldbasis' ? v : Number(v);
      found++;
    }
    return found && out.maturity ? out : null;
  }

  return { PARAMS, encode, decode };
});
