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

  const NUM = /^-?\d+(\.\d+)?$/;
  const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
  // Data AAAA-MM-GG che esiste davvero (niente 30 febbraio).
  function isDate(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  const TEXT = new Set(['isin', 'settlement', 'maturity', 'calldate', 'freq', 'daycount', 'mode', 'yieldbasis']);

  // Parametro dell'URL -> campo dell'analisi, regola di validazione, nome per l'utente.
  const PARAMS = [
    ['isin', 'isin', (v) => ISIN.test(v), 'ISIN'],
    ['regolamento', 'settlement', isDate, 'data di regolamento'],
    ['scadenza', 'maturity', isDate, 'scadenza'],
    ['cedola', 'coupon', (v) => NUM.test(v), 'cedola'],
    ['frequenza', 'freq', (v) => ['1', '2', '4', '12'].includes(v), 'frequenza'],
    ['giorni', 'daycount', (v) => ['ACT/ACT', '30/360', '30E/360', 'ACT/360', 'ACT/365'].includes(v), 'convenzione dei giorni'],
    ['rimborso', 'redemption', (v) => NUM.test(v), 'prezzo di rimborso'],
    ['modo', 'mode', (v) => v === 'price' || v === 'yield', 'calcolo dal prezzo o dal rendimento'],
    ['prezzo', 'price', (v) => NUM.test(v), 'prezzo'],
    ['rendimento', 'yield', (v) => NUM.test(v), 'rendimento'],
    ['base', 'yieldbasis', (v) => v === 'eff' || v === 'nom', 'tipo di rendimento'],
    ['nominale', 'nominal', (v) => NUM.test(v), 'nominale'],
    ['commissioni', 'commission', (v) => NUM.test(v), 'commissioni'],
    ['tassa', 'tax', (v) => NUM.test(v), 'aliquota'],
    ['bollo', 'stamp', (v) => v === '1' || v === '0', 'bollo'],
    ['call', 'calldate', isDate, 'data di call'],
    ['prezzocall', 'callprice', (v) => NUM.test(v), 'prezzo di call'],
  ];
  // Parametri che il pulsante "Condividi analisi" scrive sempre. Il prezzo no:
  // senza prezzo il calcolo usa 100 da entrambe le parti.
  const ALWAYS = ['regolamento', 'scadenza', 'cedola', 'frequenza', 'giorni', 'rimborso', 'modo', 'nominale', 'commissioni', 'tassa', 'bollo'];

  // Numero in notazione decimale semplice, mai esponenziale (1e-7 -> 0.0000001).
  function plain(n) {
    const s = String(+n.toPrecision(15));
    return /e/i.test(s) ? n.toFixed(20).replace(/\.?0+$/, '') : s;
  }

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
      else if (typeof v === 'number') v = plain(v);
      q.set(param, String(v));
    }
    return q.toString();
  }

  /**
   * Query string -> dati dell'analisi, con quello che non si è potuto leggere.
   * - data: i campi validi, oppure null se manca la scadenza;
   * - known: il link contiene almeno un parametro del calcolatore;
   * - problems: nomi per l'utente dei dati mancanti o non validi.
   */
  function parse(search) {
    const q = new URLSearchParams(search || '');
    const out = {};
    const problems = [];
    let known = false;
    for (const [param, field, valid, label] of PARAMS) {
      if (!q.has(param)) {
        if (ALWAYS.includes(param)) problems.push(label);
        continue;
      }
      known = true;
      const v = (q.get(param) || '').trim();
      if (!v || !valid(v)) {
        problems.push(label);
        continue;
      }
      out[field] = field === 'stamp' ? v === '1' : TEXT.has(field) ? v : Number(v);
    }
    if (out.mode === 'yield') {
      if (out.yield === undefined && !problems.includes('rendimento')) problems.push('rendimento');
      if (out.yieldbasis === undefined && !problems.includes('tipo di rendimento')) problems.push('tipo di rendimento');
    }
    if (out.calldate && out.callprice === undefined && !problems.includes('prezzo di call')) problems.push('prezzo di call');
    return { data: out.maturity ? out : null, known, problems };
  }

  /** Solo i dati: null se il link non contiene un'analisi. */
  function decode(search) {
    return parse(search).data;
  }

  return { PARAMS, encode, decode, parse, plain };
});
