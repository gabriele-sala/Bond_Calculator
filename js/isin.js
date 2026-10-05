/*
 * Ricerca per ISIN: validazione del codice, elenco dei titoli di Stato,
 * link a Borsa Italiana e collegamento opzionale a un servizio prezzi.
 *
 * Il file funziona sia nel browser (globale `Isin`) sia in Node (`require`).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Isin = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------- codice

  function normalize(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  // Formato ISO 6166 e cifra di controllo (Luhn sulle cifre, lettere A=10 … Z=35).
  function isValid(s) {
    const isin = normalize(s);
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
    const digits = isin.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = digits.charCodeAt(digits.length - 1 - i) - 48;
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return sum % 10 === 0;
  }

  // ------------------------------------------------------ Borsa Italiana

  const MOT_SEGMENT = { BTP: 'btp', 'BTP Green': 'btp', 'BTP Short Term': 'btp', BOT: 'bot', CCTeu: 'cct' };

  function borsaItalianaUrl(isin, tipo) {
    const code = normalize(isin);
    const segment = MOT_SEGMENT[tipo];
    if (segment) return `https://www.borsaitaliana.it/borsa/obbligazioni/mot/${segment}/scheda/${code}-MOTX.html?lang=it`;
    return `https://www.borsaitaliana.it/borsa/searchengine/search.html?q=${code}&lang=it`;
  }

  // ---------------------------------------------- elenco titoli di Stato

  const FIXED = ['BTP', 'BTP Green', 'BTP Short Term'];
  const ZERO = ['BOT', 'CTZ'];
  const UNSUPPORTED = {
    CCTeu: 'Il CCTeu ha la cedola variabile, legata all\'Euribor: il calcolatore gestisce solo cedole fisse.',
    'BTP Italia': 'Il BTP Italia è indicizzato all\'inflazione italiana: il calcolatore gestisce solo titoli a cedola fissa.',
    'BTP Italia Sì': 'Il BTP Italia Sì è indicizzato all\'inflazione italiana: il calcolatore gestisce solo titoli a cedola fissa.',
    'BTP€i': 'Il BTP€i è indicizzato all\'inflazione europea: il calcolatore gestisce solo titoli a cedola fissa.',
    'BTP Valore': 'Il BTP Valore ha cedole crescenti nel tempo (step-up): il calcolatore gestisce solo cedole costanti.',
    'BTP Più': 'Il BTP Più ha cedole crescenti nel tempo (step-up): il calcolatore gestisce solo cedole costanti.',
    'BTP Futura': 'Il BTP Futura ha cedole crescenti nel tempo (step-up): il calcolatore gestisce solo cedole costanti.',
  };

  function indexCatalog(data) {
    const map = new Map();
    for (const t of (data && data.titoli) || []) {
      if (t && t.isin) map.set(normalize(t.isin), t);
    }
    return map;
  }

  /**
   * Converte un titolo dell'elenco nei valori del modulo.
   * Restituisce { values } oppure { unsupported: messaggio }.
   */
  function toFormValues(t, settlementISO) {
    if (settlementISO && t.scadenza <= settlementISO) {
      return { unsupported: 'Il titolo è scaduto il ' + t.scadenza.split('-').reverse().join('/') + '.' };
    }
    if (UNSUPPORTED[t.tipo]) return { unsupported: UNSUPPORTED[t.tipo] };
    if (ZERO.includes(t.tipo)) {
      return { values: { maturity: t.scadenza, coupon: 0, freq: 1, dayCount: 'ACT/ACT', redemption: 100 } };
    }
    if (FIXED.includes(t.tipo) && Number.isFinite(t.cedola)) {
      return {
        values: { maturity: t.scadenza, coupon: t.cedola, freq: t.frequenza || 2, dayCount: 'ACT/ACT', redemption: 100 },
      };
    }
    return { unsupported: 'Tipologia di titolo non riconosciuta: inserisci i dati a mano.' };
  }

  // ------------------------------------------------------ servizio prezzi

  /**
   * Chiede il prezzo a un servizio esterno, se configurato.
   * Contratto: GET {endpoint}?isin=XX… → { isin, price, time, source }
   *  - price: prezzo secco per 100 di nominale
   *  - time: istante della rilevazione in formato ISO 8601
   *  - source: nome della fonte da mostrare all'utente
   * Restituisce null se il servizio non è configurato o non ha il titolo.
   */
  async function fetchPrice(isin, endpoint, fetchImpl) {
    if (!endpoint) return null;
    const code = normalize(isin);
    const doFetch = fetchImpl || fetch;
    const sep = endpoint.includes('?') ? '&' : '?';
    const res = await doFetch(endpoint + sep + 'isin=' + encodeURIComponent(code));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Servizio prezzi non disponibile (' + res.status + ').');
    const body = await res.json();
    if (!body || normalize(body.isin) !== code || !(Number(body.price) > 0)) {
      throw new Error('Risposta del servizio prezzi non valida.');
    }
    const time = body.time ? new Date(body.time) : null;
    return {
      price: Number(body.price),
      time: time && !isNaN(time) ? time : null,
      source: String(body.source || ''),
    };
  }

  return { normalize, isValid, borsaItalianaUrl, indexCatalog, toFormValues, fetchPrice, UNSUPPORTED };
});
