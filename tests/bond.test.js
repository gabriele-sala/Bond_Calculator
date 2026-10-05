const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/bond.js');

const d = (s) => B.parseDate(s);
const close = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} atteso ${expected}, ottenuto ${actual}`);

function bond(over) {
  return B.createBond({
    settlement: d('2008-02-15'),
    maturity: d('2017-11-15'),
    couponRate: 0.0575,
    freq: 2,
    redemption: 100,
    dayCount: '30/360',
    ...over,
  });
}

// Valori di riferimento: documentazione Microsoft delle funzioni Excel.
test('PRICE Excel: 94,63436 (30/360, semestrale)', () => {
  const b = bond();
  close(B.cleanFromYield(b, 0.065), 94.63436, 1e-5);
});

test('YIELD Excel: 6,5% (30/360, semestrale)', () => {
  const b = bond({ maturity: d('2016-11-15') });
  close(B.yieldFromClean(b, 95.04287), 0.065, 1e-7);
});

test('DURATION Excel: 10,9191453 (ACT/ACT)', () => {
  const b = bond({
    settlement: d('2018-07-01'),
    maturity: d('2048-01-01'),
    couponRate: 0.08,
    dayCount: 'ACT/ACT',
  });
  close(B.risk(b, 0.09).macaulay, 10.9191453, 1e-6);
});

test('MDURATION Excel: 5,73567 (ACT/ACT)', () => {
  const b = bond({
    settlement: d('2008-01-01'),
    maturity: d('2016-01-01'),
    couponRate: 0.08,
    dayCount: 'ACT/ACT',
  });
  close(B.risk(b, 0.09).modified, 5.73567, 1e-5);
});

test('rateo 30/360: 90 giorni su 180', () => {
  const b = bond();
  assert.equal(b.A, 90);
  assert.equal(b.E, 180);
  close(b.accrued, 1.4375, 1e-12);
});

test('rateo ACT/ACT ICMA: giorni effettivi sul periodo effettivo', () => {
  const b = bond({ settlement: d('2024-03-01'), maturity: d('2030-08-01'), dayCount: 'ACT/ACT', couponRate: 0.04 });
  // periodo 1 feb 2024 - 1 ago 2024 = 182 giorni, maturati 29
  assert.equal(b.E, 182);
  assert.equal(b.A, 29);
  close(b.accrued, 2 * 29 / 182, 1e-12);
});

test('regolamento in data cedola: rateo nullo e primo flusso a un periodo', () => {
  const b = bond({ settlement: d('2008-05-15') });
  assert.equal(b.accrued, 0);
  close(b.cashflows[0].t, 1, 1e-12);
});

test('calendario con regola di fine mese', () => {
  const s = B.couponSchedule(d('2028-01-10'), d('2030-02-28'), 2);
  assert.deepEqual(s.dates.map(B.toISO), ['2028-02-29', '2028-08-31', '2029-02-28', '2029-08-31', '2030-02-28']);
  assert.equal(B.toISO(s.prev), '2027-08-31');
});

test('giorni 30/360 US e 30E/360', () => {
  assert.equal(B.days30US(d('2024-01-31'), d('2024-03-31')), 60);
  assert.equal(B.days30US(d('2023-02-28'), d('2023-08-31')), 180);
  assert.equal(B.days30E(d('2024-01-30'), d('2024-03-31')), 60);
  assert.equal(B.days30E(d('2023-02-28'), d('2023-08-31')), 182);
});

test('prezzo e rendimento sono inversi', () => {
  for (const dc of Object.keys(B.DAY_COUNTS)) {
    for (const y of [-0.005, 0.0, 0.02, 0.07, 0.25]) {
      const b = bond({ settlement: d('2025-03-17'), maturity: d('2036-09-01'), dayCount: dc });
      const p = B.cleanFromYield(b, y);
      close(B.yieldFromClean(b, p), y, 1e-10, dc);
    }
  }
});

test('zero coupon: rendimento effettivo annuo esatto', () => {
  const b = B.createBond({
    settlement: d('2024-06-15'),
    maturity: d('2026-06-15'),
    couponRate: 0,
    freq: 1,
    redemption: 100,
    dayCount: 'ACT/ACT',
  });
  const y = B.yieldFromClean(b, 90);
  close(y, Math.sqrt(100 / 90) - 1, 1e-12);
  close(B.risk(b, y).macaulay, 2, 1e-12);
});

test('conversione tasso nominale / effettivo', () => {
  close(B.nominalToEffective(0.04, 2), 0.0404, 1e-12);
  close(B.effectiveToNominal(0.0404, 2), 0.04, 1e-12);
});

test('convessità coerente con la derivata seconda numerica', () => {
  const b = bond({ settlement: d('2025-01-10'), maturity: d('2040-07-01'), dayCount: 'ACT/ACT' });
  const y = 0.041, h = 1e-4;
  const p0 = B.dirtyFromYield(b, y);
  const num = (B.dirtyFromYield(b, y + h) - 2 * p0 + B.dirtyFromYield(b, y - h)) / (h * h) / p0;
  close(B.risk(b, y).convexity, num, 1e-3);
});

test('rendimento netto senza tasse e costi = rendimento effettivo lordo', () => {
  const r = B.analyze({
    settlement: d('2025-10-07'),
    maturity: d('2035-02-01'),
    couponRate: 0.035,
    freq: 2,
    redemption: 100,
    dayCount: 'ACT/ACT',
    mode: 'price',
    cleanPrice: 97.4,
    nominal: 10000,
    taxRate: 0,
    commission: 0,
  });
  close(r.investor.effective, r.ytmEffective, 1e-10);
});

test('rendimento netto: tassazione 12,5% riduce il rendimento', () => {
  const base = {
    settlement: d('2025-10-07'),
    maturity: d('2035-02-01'),
    couponRate: 0.035,
    freq: 2,
    redemption: 100,
    dayCount: 'ACT/ACT',
    mode: 'price',
    cleanPrice: 97.4,
    nominal: 10000,
  };
  const g = B.analyze({ ...base, taxRate: 0 });
  const n = B.analyze({ ...base, taxRate: 0.125 });
  const nb = B.analyze({ ...base, taxRate: 0.125, stampDuty: true, commission: 15 });
  assert.ok(n.investor.effective < g.investor.effective);
  assert.ok(nb.investor.effective < n.investor.effective);
  // Con cedole e plusvalenza tassate al 12,5% il netto è vicino a 0,875 del lordo.
  close(n.investor.effective / g.ytmEffective, 0.875, 0.01);
});

test('prima cedola tassata solo sulla quota maturata dopo l\'acquisto', () => {
  const b = bond({ settlement: d('2025-03-15'), maturity: d('2027-05-15'), couponRate: 0.04, dayCount: '30/360' });
  const flows = B.investorFlows(b, { nominal: 100, cleanPrice: 100, taxRate: 0.26 });
  // rateo 120/180 di 2 = 1,3333; quota tassabile = 0,6667
  close(flows[1].couponTax, 0.26 * (2 - 2 * 120 / 180), 1e-12);
  close(flows[2].couponTax, 0.26 * 2, 1e-12);
});

test('yield to call e yield to worst', () => {
  const r = B.analyze({
    settlement: d('2025-01-15'),
    maturity: d('2032-06-15'),
    couponRate: 0.06,
    freq: 1,
    redemption: 100,
    dayCount: 'ACT/ACT',
    mode: 'price',
    cleanPrice: 104,
    call: { date: d('2027-06-15'), price: 100 },
  });
  assert.ok(r.ytc < r.ytm);
  assert.equal(r.ytw, r.ytc);
});

test('errori di input', () => {
  assert.throws(() => bond({ maturity: d('2007-01-01') }), /scadenza/);
  assert.throws(() => bond({ freq: 3 }), /Frequenza/);
});
