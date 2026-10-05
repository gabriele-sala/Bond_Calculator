const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/share.js');

const full = {
  isin: 'IT0005607970',
  settlement: '2026-10-07',
  maturity: '2035-02-01',
  coupon: 3.85,
  freq: '2',
  daycount: 'ACT/ACT',
  redemption: 100,
  mode: 'price',
  price: 101.35,
  nominal: 25000,
  commission: 12.5,
  tax: 0.125,
  stamp: true,
  calldate: '2030-02-01',
  callprice: 100,
};

test('andata e ritorno: il link ricostruisce gli stessi dati', () => {
  const q = S.encode(full);
  assert.deepEqual(S.decode('?' + q), full);
});

test('campi vuoti o non numerici non finiscono nel link', () => {
  const q = S.encode({ maturity: '2035-02-01', price: '', yield: NaN, isin: null, stamp: false });
  assert.equal(q, 'scadenza=2035-02-01&bollo=0');
});

test('parametri non validi o sconosciuti ignorati', () => {
  const r = S.decode('?scadenza=2035-02-01&prezzo=abc&giorni=XYZ&frequenza=3&isin=<b>&ciao=1&cedola=4');
  assert.deepEqual(r, { maturity: '2035-02-01', coupon: 4 });
});

test('senza scadenza non c\'è un\'analisi da ricostruire', () => {
  assert.equal(S.decode('?prezzo=100&nominale=1000'), null);
  assert.equal(S.decode(''), null);
});

test('il link contiene solo i parametri del titolo', () => {
  const q = new URLSearchParams(S.encode(full));
  const allowed = new Set(S.PARAMS.map((p) => p[0]));
  for (const k of q.keys()) assert.ok(allowed.has(k), k);
});
