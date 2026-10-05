const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/bond.js');

const d = (s) => B.parseDate(s);
const close = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} atteso ${expected}, ottenuto ${actual}`);

// Zero coupon annuale ACT/ACT con regolamento in data anniversario: tempi esatti in anni.
const zero = B.createBond({
  settlement: d('2026-06-15'),
  maturity: d('2031-06-15'),
  couponRate: 0,
  freq: 1,
  redemption: 100,
  dayCount: 'ACT/ACT',
});
const P0 = 80;
const y0 = B.yieldFromClean(zero, P0);
const lordo = { nominal: 100, cleanPrice: P0, taxRate: 0 };

const btp = B.createBond({
  settlement: d('2026-10-07'),
  maturity: d('2035-02-01'),
  couponRate: 0.0385,
  freq: 2,
  redemption: 100,
  dayCount: 'ACT/ACT',
});
const yBtp = B.yieldFromClean(btp, 101.35);
const netto = { nominal: 10000, cleanPrice: 101.35, taxRate: 0.125, commission: 0 };

test('valore all\'orizzonte: oggi vale quanto speso', () => {
  const v = B.horizonValue(btp, netto, btp.params.settlement, yBtp);
  close(v.valueGross, v.costGross, 1e-6);
  close(v.valueNet, v.costNet, 1e-6);
});

test('valore a scadenza = cedole + rimborso, al netto della ritenuta', () => {
  const v = B.horizonValue(btp, netto, btp.params.maturity, yBtp);
  const Q = 100;
  const coupons = btp.cashflows.length * Q * 1.925;
  close(v.valueGross, coupons + Q * 100, 1e-6);
  // prima cedola tassata solo dopo il rateo pagato; rimborso sotto il prezzo: nessuna plusvalenza
  const taxed = coupons - Q * btp.accrued;
  close(v.valueNet, coupons - 0.125 * taxed + Q * 100, 1e-6);
});

test('pareggio a 1 anno, zero coupon: formula chiusa', () => {
  // 100 / (1 + y0 + Δ)^4 = P0  =>  Δ = (100 / P0)^(1/4) - 1 - y0
  const r = B.breakEvenShift(zero, lordo, y0, 1);
  close(r.gross, Math.pow(100 / P0, 1 / 4) - 1 - y0, 1e-8);
  close(r.net, r.gross, 1e-12, 'senza tasse lordo = netto');
});

test('pareggio: rivendendo al rendimento di pareggio si recupera esattamente', () => {
  for (const years of [1, 3]) {
    const r = B.breakEvenShift(btp, netto, yBtp, years);
    const vg = B.horizonValue(btp, netto, r.horizon, yBtp + r.gross);
    const vn = B.horizonValue(btp, netto, r.horizon, yBtp + r.net);
    close(vg.valueGross, vg.costGross, 1e-4, `lordo ${years} anni`);
    close(vn.valueNet, vn.costNet, 1e-4, `netto ${years} anni`);
    assert.ok(r.net < r.gross, 'le tasse riducono il margine');
  }
});

test('pareggio: regola pratica rendimento / duration all\'orizzonte', () => {
  const r = B.breakEvenShift(btp, { ...netto, taxRate: 0 }, yBtp, 1);
  const later = B.createBond({ ...btp.params, settlement: r.horizon });
  const approx = yBtp / B.risk(later, yBtp).modified;
  close(r.gross, approx, approx * 0.1, 'entro il 10% della regola pratica');
});

test('pareggio non definito se l\'orizzonte supera la scadenza', () => {
  assert.equal(B.breakEvenShift(zero, lordo, y0, 6), null);
});

test('tempo di recupero, zero coupon: formula chiusa', () => {
  // 100 / (1 + y)^(T - t) >= P0  =>  t >= T - ln(100 / P0) / ln(1 + y)
  for (const shift of [0.005, 0.01, 0.02]) {
    const y = y0 + shift;
    const expected = 5 - Math.log(100 / P0) / Math.log(1 + y);
    const r = B.recoveryTime(zero, lordo, y0, shift);
    const t = zero.timeTo(r.gross.date); // in anni, convenzione ACT/ACT
    assert.ok(t >= expected - 1e-9 && t <= expected + 1 / 365 + 1e-9, `+${shift * 1e4} pb: atteso ${expected}, ottenuto ${t}`);
  }
});

test('tempo di recupero: nessun rialzo, nessuna attesa', () => {
  const r = B.recoveryTime(btp, { ...netto, taxRate: 0 }, yBtp, 0);
  assert.equal(r.gross.years, 0);
});

test('tempo di recupero: cresce con lo shock e il netto arriva dopo il lordo', () => {
  const t = [0.005, 0.01, 0.02].map((s) => B.recoveryTime(btp, netto, yBtp, s));
  for (let i = 1; i < t.length; i++) assert.ok(t[i].gross.years > t[i - 1].gross.years);
  for (const r of t) assert.ok(r.net.years >= r.gross.years);
});

test('tempo di recupero: impossibile prima della scadenza', () => {
  // Comprato molto sopra la pari a cedola zero: il rimborso non basta mai.
  const caro = { nominal: 100, cleanPrice: 110, taxRate: 0 };
  const yc = B.yieldFromClean(zero, 110);
  assert.equal(B.recoveryTime(zero, caro, yc, 0.01).gross, null);
});
