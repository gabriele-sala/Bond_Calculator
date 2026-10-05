const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/bond.js');
const P = require('../js/portfolio.js');

const d = (s) => B.parseDate(s);
const close = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} atteso ${expected}, ottenuto ${actual}`);

const SETTLE = d('2026-10-07');
const pos = (over) => ({
  id: 'x',
  label: 'BTP',
  maturity: '2035-02-01',
  couponRate: 0.0385,
  freq: 2,
  dayCount: 'ACT/ACT',
  redemption: 100,
  cleanPrice: 101.35,
  nominal: 10000,
  taxRate: 0.125,
  ...over,
});
const BTP35 = pos({ id: 'a' });
const BTP27 = pos({ id: 'b', label: 'BTP breve', maturity: '2027-11-01', couponRate: 0.02, cleanPrice: 99.1, nominal: 20000 });
const BTP54 = pos({ id: 'c', label: 'BTP lungo', maturity: '2054-09-01', couponRate: 0.045, cleanPrice: 97.2, nominal: 5000 });

test('curva: interpolazione fra i nodi e valori costanti agli estremi', () => {
  const n = [-25, 25, 50];
  close(P.curveShift(n, 1), -0.0025, 1e-12);
  close(P.curveShift(n, 2), -0.0025, 1e-12);
  close(P.curveShift(n, 6), 0, 1e-12);
  close(P.curveShift(n, 10), 0.0025, 1e-12);
  close(P.curveShift(n, 20), 0.00375, 1e-12);
  close(P.curveShift(n, 40), 0.005, 1e-12);
});

test('XIRR: formula chiusa su due flussi', () => {
  const r = P.xirr([{ date: d('2026-01-01'), amount: -80 }, { date: d('2031-01-01'), amount: 100 }]);
  const t = B.actualDays(d('2026-01-01'), d('2031-01-01')) / 365;
  close(r, Math.pow(100 / 80, 1 / t) - 1, 1e-10);
});

test('portafoglio di un solo titolo: totali uguali al titolo', () => {
  const { rows, totals } = P.analyzePortfolio([BTP35], SETTLE);
  const r = rows[0];
  close(totals.marketValue, r.marketValue, 1e-9);
  close(totals.modified, r.modified, 1e-12);
  close(totals.dv01, r.dv01, 1e-12);
  // XIRR (giorni/365) e rendimento ICMA differiscono solo per la misura del tempo.
  close(totals.irrGross, r.ytmEffective, 0.0003, 'rendimento interno lordo');
  close(totals.irrNet, r.netEffective, 0.0003, 'rendimento interno netto');
  close(totals.breakEven1.gross, r.breakEven1.gross, 1e-8);
  close(totals.breakEven1.net, r.breakEven1.net, 1e-8);
});

test('duplicare un titolo raddoppia controvalore e DV01, non la duration', () => {
  const one = P.analyzePortfolio([BTP35], SETTLE).totals;
  const two = P.analyzePortfolio([BTP35, { ...BTP35, id: 'a2' }], SETTLE).totals;
  close(two.marketValue, 2 * one.marketValue, 1e-6);
  close(two.dv01, 2 * one.dv01, 1e-9);
  close(two.modified, one.modified, 1e-12);
  close(two.irrGross, one.irrGross, 1e-9);
});

test('duration e convessità pesate per il controvalore', () => {
  const { rows, totals } = P.analyzePortfolio([BTP35, BTP27, BTP54], SETTLE);
  const mv = rows.reduce((s, r) => s + r.marketValue, 0);
  close(totals.modified, rows.reduce((s, r) => s + r.modified * r.marketValue, 0) / mv, 1e-12);
  close(totals.convexity, rows.reduce((s, r) => s + r.convexity * r.marketValue, 0) / mv, 1e-12);
  assert.ok(totals.modified > rows[1].modified && totals.modified < rows[2].modified);
  // Il rendimento interno sta fra quelli dei singoli titoli.
  const ys = rows.map((r) => r.ytmEffective);
  assert.ok(totals.irrGross > Math.min(...ys) && totals.irrGross < Math.max(...ys));
});

test('scenario parallelo: uguale alla variazione del singolo titolo', () => {
  const { rows } = P.analyzePortfolio([BTP35, BTP54], SETTLE);
  const s = P.scenarioPnL(rows, [100, 100, 100]);
  rows.forEach((r, i) => {
    const ref = B.scenarios(r.bond, r.ytm, [100], true)[0];
    close(s.items[i].pct, ref.change, 1e-12);
  });
  close(s.total.pnl, s.items[0].pnl + s.items[1].pnl, 1e-9);
});

test('irripidimento: i titoli brevi salgono, i lunghi scendono', () => {
  const { rows } = P.analyzePortfolio([BTP27, BTP54], SETTLE);
  const s = P.scenarioPnL(rows, [-25, 25, 50]);
  close(s.items[0].shift, -0.0025, 1e-12, 'titolo a 1 anno: nodo a 2 anni');
  assert.ok(s.items[0].pnl > 0);
  assert.ok(s.items[1].shift > 0.0045 && s.items[1].pnl < 0);
});

test('incassi per anno: somme uguali ai flussi dei titoli', () => {
  const { rows } = P.analyzePortfolio([BTP35, BTP27], SETTLE);
  const cal = P.cashflowCalendar(rows);
  const sum = (k) => cal.reduce((s, e) => s + e[k], 0);
  const gross = rows.flatMap((r) => r.flows.filter((f) => f.kind === 'flusso')).reduce((s, f) => s + f.grossCoupon + f.principal, 0);
  close(sum('couponsGross') + sum('redemptions'), gross, 1e-6);
  assert.equal(cal[0].year, 2026, 'cedola del BTP 2027 il 1° novembre 2026');
  close(cal.find((e) => e.year === 2027).redemptions, 20000, 1e-9, 'rimborso del BTP 2027');
  assert.ok(sum('couponsNet') < sum('couponsGross'));
});

test('posizioni non valide finiscono negli errori, le altre restano', () => {
  const res = P.analyzePortfolio([BTP35, pos({ id: 'z', maturity: '2020-01-01' })], SETTLE);
  assert.equal(res.rows.length, 1);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0].message, /scadenza/);
});

test('rendimento a 1 anno nello scenario: coerente con il valore all\'orizzonte', () => {
  const { rows } = P.analyzePortfolio([BTP35, BTP27], SETTLE);
  const s = P.scenarioHorizon(rows, [0, 0, 0], 1, SETTLE);
  const v = B.horizonValue(rows[0].bond, rows[0].opts, s.horizon, rows[0].ytm);
  close(s.items[0].net, v.valueNet / v.costNet - 1, 1e-12);
  // Senza spostamenti il rendimento a 1 anno è vicino al rendimento del titolo.
  close(s.items[0].gross, rows[0].ytmEffective, 0.004, 'titolo 2035');
  // Al pareggio il rendimento lordo a 1 anno è zero.
  const be = rows[0].breakEven1.gross * 1e4;
  close(P.scenarioHorizon([rows[0]], [be, be, be], 1, SETTLE).items[0].gross, 0, 1e-8);
});

test('rendimento a 1 anno: il totale pesa i titoli per quanto speso', () => {
  const { rows } = P.analyzePortfolio([BTP35, BTP27, BTP54], SETTLE);
  const s = P.scenarioHorizon(rows, [100, 100, 100], 1, SETTLE);
  const lo = Math.min(...s.items.map((x) => x.gross)), hi = Math.max(...s.items.map((x) => x.gross));
  assert.ok(s.total.gross >= lo && s.total.gross <= hi);
  assert.ok(s.items[2].gross < s.items[1].gross, 'con +100 pb il lungo rende meno del breve');
});

test('pareggio di portafoglio con prezzi alti su titoli brevi: uguale al singolo titolo', () => {
  const caro = pos({ id: 'k', maturity: '2028-03-01', couponRate: 0.005, cleanPrice: 104 });
  const { rows, totals } = P.analyzePortfolio([caro], SETTLE);
  for (const k of ['gross', 'net']) {
    const one = rows[0].breakEven1[k], all = totals.breakEven1[k];
    if (Number.isFinite(one)) close(all, one, 1e-8, k);
    else assert.equal(all, one, k);
  }
});

test('XIRR con rendimenti molto alti', () => {
  const r = P.xirr([{ date: d('2026-01-01'), amount: -10 }, { date: d('2027-01-01'), amount: 1000 }]);
  close(r, 99, 1e-6);
});
