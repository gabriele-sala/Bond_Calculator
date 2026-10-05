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

test('link completo: nessun dato mancante', () => {
  const r = S.parse('?' + S.encode(full));
  assert.deepEqual(r.problems, []);
  assert.equal(r.known, true);
  const y = S.parse('?' + S.encode({ ...full, mode: 'yield', price: undefined, yield: 3.123456789, yieldbasis: 'nom' }));
  assert.deepEqual(y.problems, []);
  assert.equal(y.data.yield, 3.123456789);
});

test('link troncato o modificato a mano: segnala i dati non letti', () => {
  const q = S.encode(full);
  const cut = S.parse('?' + q.slice(0, q.indexOf('prezzo=') + 'prezzo'.length));
  assert.deepEqual(cut.problems, ['prezzo', 'nominale', 'commissioni', 'aliquota', 'bollo']);
  assert.equal(cut.data.maturity, '2035-02-01');
  assert.equal(cut.data.price, undefined);
  const r = S.parse('?' + q.replace('prezzo=101.35', 'prezzo=99,8').replace('regolamento=2026-10-07', 'regolamento=2026-02-30'));
  assert.deepEqual(r.problems, ['data di regolamento', 'prezzo']);
  assert.equal(r.data.settlement, undefined);
  assert.equal(S.parse('?' + q.replace('modo=price', 'modo=yield')).problems.join(), 'rendimento,tipo di rendimento');
});

test('date inesistenti rifiutate', () => {
  assert.equal(S.decode('?scadenza=2031-02-30'), null);
  assert.equal(S.decode('?scadenza=2032-02-29').maturity, '2032-02-29');
  assert.equal(S.decode('?scadenza=2031-13-01'), null);
});

test('query senza parametri del calcolatore: nessun link', () => {
  const r = S.parse('?utm_source=x&ref=y');
  assert.equal(r.known, false);
  assert.equal(r.data, null);
  assert.equal(S.parse('?regolamento=2026-10-07&scaden').known, true);
  assert.equal(S.parse('?regolamento=2026-10-07&scaden').data, null);
});

test('numeri scritti per intero, mai in notazione esponenziale', () => {
  const st = { maturity: '2035-02-01', tax: 0.00001 / 100, nominal: 1000.125, commission: 2.555, price: 99.12345649 };
  const q = S.encode(st);
  assert.ok(!/e-|e\+/i.test(q), q);
  assert.match(q, /tassa=0\.0000001(&|$)/);
  assert.deepEqual(S.decode('?' + q), { ...st, tax: 1e-7 });
});
