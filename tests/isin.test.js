const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/isin.js');

test('validazione ISIN con cifra di controllo', () => {
  for (const ok of ['US0378331005', 'IT0003934657', 'IT0005678492', 'IT0005620460', 'XS2535352962']) {
    assert.ok(I.isValid(ok), ok);
  }
  assert.ok(I.isValid(' it 0003934657 '), 'spazi e minuscole ammessi');
  for (const bad of ['US0378331006', 'IT000393465', 'IT00039346570', '1T0003934657', '']) {
    assert.ok(!I.isValid(bad), bad);
  }
});

test('link a Borsa Italiana per tipologia', () => {
  assert.equal(
    I.borsaItalianaUrl('IT0003934657', 'BTP'),
    'https://www.borsaitaliana.it/borsa/obbligazioni/mot/btp/scheda/IT0003934657-MOTX.html?lang=it'
  );
  assert.match(I.borsaItalianaUrl('IT0005678492', 'BOT'), /\/mot\/bot\/scheda\/IT0005678492-MOTX\.html/);
  assert.match(I.borsaItalianaUrl('XS2535352962'), /searchengine\/search\.html\?q=XS2535352962/);
});

const catalog = I.indexCatalog({
  titoli: [
    { isin: 'IT0000000001', descrizione: 'BTP 3,85% 01/02/2035', tipo: 'BTP', cedola: 3.85, frequenza: 2, scadenza: '2035-02-01' },
    { isin: 'IT0000000002', descrizione: 'BOT 14/05/2027', tipo: 'BOT', cedola: null, scadenza: '2027-05-14' },
    { isin: 'IT0000000003', descrizione: 'CCTeu 15/04/2033', tipo: 'CCTeu', cedola: null, scadenza: '2033-04-15' },
  ],
});

test('titolo a cedola fissa', () => {
  const r = I.toFormValues(catalog.get('IT0000000001'), '2026-10-07');
  assert.deepEqual(r.values, { maturity: '2035-02-01', coupon: 3.85, freq: 2, dayCount: 'ACT/ACT', redemption: 100 });
});

test('zero coupon', () => {
  const r = I.toFormValues(catalog.get('IT0000000002'), '2026-10-07');
  assert.equal(r.values.coupon, 0);
  assert.equal(r.values.freq, 1);
});

test('titoli non gestiti e scaduti', () => {
  assert.match(I.toFormValues(catalog.get('IT0000000003'), '2026-10-07').unsupported, /variabile/);
  assert.match(I.toFormValues(catalog.get('IT0000000002'), '2027-06-01').unsupported, /scaduto il 14\/05\/2027/);
  assert.match(I.toFormValues({ tipo: 'Altro', scadenza: '2030-01-01' }, '2026-10-07').unsupported, /non riconosciuta/);
});

const fakeFetch = (status, body) => async (url) => {
  fakeFetch.last = url;
  return { status, ok: status >= 200 && status < 300, json: async () => body };
};

test('servizio prezzi: non configurato', async () => {
  assert.equal(await I.fetchPrice('IT0003934657', '', fakeFetch(200, {})), null);
});

test('servizio prezzi: risposta valida', async () => {
  const r = await I.fetchPrice(
    'IT0003934657',
    'https://prezzi.example/api',
    fakeFetch(200, { isin: 'IT0003934657', price: 101.35, time: '2026-10-05T14:32:00Z', source: 'Prova' })
  );
  assert.equal(fakeFetch.last, 'https://prezzi.example/api?isin=IT0003934657');
  assert.equal(r.price, 101.35);
  assert.equal(r.time.toISOString(), '2026-10-05T14:32:00.000Z');
  assert.equal(r.source, 'Prova');
});

test('servizio prezzi: titolo assente e risposte errate', async () => {
  assert.equal(await I.fetchPrice('IT0003934657', 'https://p.example/?k=1', fakeFetch(404, null)), null);
  assert.equal(fakeFetch.last, 'https://p.example/?k=1&isin=IT0003934657');
  await assert.rejects(I.fetchPrice('IT0003934657', 'https://p.example', fakeFetch(500, null)), /non disponibile/);
  await assert.rejects(
    I.fetchPrice('IT0003934657', 'https://p.example', fakeFetch(200, { isin: 'IT0005678492', price: 99 })),
    /non valida/
  );
});
