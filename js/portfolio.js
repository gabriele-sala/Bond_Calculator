/*
 * Confronto e portafoglio: analisi di più obbligazioni con la stessa data di
 * regolamento, totali di portafoglio, incassi per anno e scenari sulla curva.
 *
 * Funziona sia nel browser (globale `Portfolio`, richiede `Bond`) sia in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./bond.js'));
  else root.Portfolio = factory(root.Bond);
})(typeof self !== 'undefined' ? self : this, function (B) {
  'use strict';

  // ------------------------------------------------------------ scenari

  // Spostamenti dei rendimenti effettivi annui, in punti base, ai nodi di 2, 10 e 30 anni.
  const SCENARIOS = [
    { key: 'p-100', label: '−100 pb', nodes: [-100, -100, -100] },
    { key: 'p-50', label: '−50 pb', nodes: [-50, -50, -50] },
    { key: 'p+25', label: '+25 pb', nodes: [25, 25, 25] },
    { key: 'p+50', label: '+50 pb', nodes: [50, 50, 50] },
    { key: 'p+100', label: '+100 pb', nodes: [100, 100, 100] },
    { key: 'p+200', label: '+200 pb', nodes: [200, 200, 200] },
    { key: 'steep', label: 'Irripidimento', nodes: [-25, 25, 50], curve: true },
    { key: 'flat', label: 'Appiattimento', nodes: [25, 0, -25], curve: true },
  ];
  const NODE_YEARS = [2, 10, 30];

  /**
   * Spostamento (in decimale) per una vita residua di `years` anni:
   * interpolazione lineare fra i nodi, costante prima del primo e dopo l'ultimo.
   */
  function curveShift(nodesBp, years) {
    const [a, b, c] = nodesBp;
    let bp;
    if (years <= NODE_YEARS[0]) bp = a;
    else if (years <= NODE_YEARS[1]) bp = a + ((b - a) * (years - NODE_YEARS[0])) / (NODE_YEARS[1] - NODE_YEARS[0]);
    else if (years <= NODE_YEARS[2]) bp = b + ((c - b) * (years - NODE_YEARS[1])) / (NODE_YEARS[2] - NODE_YEARS[1]);
    else bp = c;
    return bp / 10000;
  }

  // ---------------------------------------------------- rendimento interno

  /**
   * Rendimento effettivo annuo di una serie di flussi datati (come XIRR):
   * somma(flusso / (1 + r)^(giorni/365)) = 0, con il primo flusso negativo.
   */
  function xirr(flows) {
    const t0 = flows[0].date;
    const items = flows.map((f) => ({ t: B.actualDays(t0, f.date) / 365, a: f.amount }));
    const npv = (r) => items.reduce((s, x) => s + x.a * Math.pow(1 + r, -x.t), 0);
    let lo = -0.99, hi = 1;
    while (npv(hi) > 0 && hi < 1e6) hi *= 2;
    if (npv(lo) * npv(hi) > 0) return NaN;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (npv(mid) > 0) lo = mid;
      else hi = mid;
      if (hi - lo < 1e-12) break;
    }
    return (lo + hi) / 2;
  }

  // ----------------------------------------------------------- analisi

  /**
   * Posizione: { id, label, isin?, maturity: 'AAAA-MM-GG', couponRate (decimale),
   *   freq, dayCount, redemption, cleanPrice, nominal, taxRate }
   */
  function analyzePosition(pos, settlement) {
    const bond = B.createBond({
      settlement,
      maturity: B.parseDate(pos.maturity),
      couponRate: pos.couponRate,
      freq: pos.freq,
      redemption: pos.redemption,
      dayCount: pos.dayCount,
    });
    const Q = pos.nominal / 100;
    const ytm = B.yieldFromClean(bond, pos.cleanPrice);
    if (!Number.isFinite(ytm)) throw new Error('Rendimento non calcolabile con questo prezzo.');
    const risk = B.risk(bond, ytm);
    const opts = { nominal: pos.nominal, cleanPrice: pos.cleanPrice, taxRate: pos.taxRate || 0 };
    const inv = B.investorYield(bond, opts);
    // Pareggio espresso come spostamento del rendimento effettivo annuo.
    const beNominal = B.breakEvenShift(bond, opts, ytm, 1);
    const eff = B.nominalToEffective(ytm, bond.freq);
    const toEff = (dn) => (Number.isFinite(dn) ? B.nominalToEffective(ytm + dn, bond.freq) - eff : dn);
    const be = beNominal && { horizon: beNominal.horizon, gross: toEff(beNominal.gross), net: toEff(beNominal.net) };
    return {
      pos,
      bond,
      opts,
      ytm,
      ytmEffective: B.nominalToEffective(ytm, bond.freq),
      netEffective: inv.effective,
      flows: inv.flows,
      dirty: risk.dirty,
      marketValue: Q * risk.dirty,
      modified: risk.modified,
      macaulay: risk.macaulay,
      convexity: risk.convexity,
      dv01: Q * risk.dv01,
      years: bond.yearsToMaturity,
      breakEven1: be,
    };
  }

  // Rialzo parallelo dei rendimenti effettivi di pareggio per l'intero portafoglio.
  function portfolioBreakEven(rows, settlement, years) {
    const horizon = B.addYears(settlement, years);
    if (!rows.some((r) => r.bond.params.maturity > horizon)) return null;
    const total = (d, key) =>
      rows.reduce((s, r) => {
        const v = B.horizonValue(r.bond, r.opts, horizon, B.shiftEffective(r.ytm, r.bond.freq, d));
        return s + (key === 'gross' ? v.valueGross - v.costGross : v.valueNet - v.costNet);
      }, 0);
    // Limite inferiore: nessun rendimento effettivo può scendere a -99%.
    const minEff = Math.min(...rows.map((r) => r.ytmEffective));
    const solve = (key) => {
      let lo = Math.max(-0.5, -0.99 - minEff), hi = 1;
      if (total(lo, key) < 0) return -Infinity;
      if (total(hi, key) > 0) return Infinity;
      for (let i = 0; i < 100 && hi - lo > 1e-9; i++) {
        const mid = (lo + hi) / 2;
        if (total(mid, key) >= 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    return { horizon, gross: solve('gross'), net: solve('net') };
  }

  function analyzePortfolio(positions, settlement) {
    const rows = [];
    const errors = [];
    for (const pos of positions) {
      try {
        rows.push(analyzePosition(pos, settlement));
      } catch (e) {
        errors.push({ pos, message: e.message });
      }
    }
    if (!rows.length) return { rows, errors, totals: null };

    const mv = rows.reduce((s, r) => s + r.marketValue, 0);
    const weighted = (k) => rows.reduce((s, r) => s + r[k] * r.marketValue, 0) / mv;

    // Flussi complessivi: esborso oggi, poi incassi lordi e netti alle loro date.
    const grossFlows = [{ date: settlement, amount: -mv }];
    const netFlows = [{ date: settlement, amount: -mv }];
    for (const r of rows) {
      for (const f of r.flows) {
        if (f.kind !== 'flusso') continue;
        grossFlows.push({ date: f.date, amount: f.grossCoupon + f.principal });
        netFlows.push({ date: f.date, amount: f.amount });
      }
    }

    const totals = {
      nominal: rows.reduce((s, r) => s + r.pos.nominal, 0),
      marketValue: mv,
      irrGross: xirr(grossFlows),
      irrNet: xirr(netFlows),
      modified: weighted('modified'),
      convexity: weighted('convexity'),
      years: weighted('years'),
      dv01: rows.reduce((s, r) => s + r.dv01, 0),
      breakEven1: portfolioBreakEven(rows, settlement, 1),
    };
    return { rows, errors, totals };
  }

  // ---------------------------------------------------- incassi per anno

  function cashflowCalendar(rows) {
    const byYear = new Map();
    for (const r of rows) {
      for (const f of r.flows) {
        if (f.kind !== 'flusso') continue;
        const y = f.date.getUTCFullYear();
        const e = byYear.get(y) || { year: y, couponsGross: 0, couponsNet: 0, redemptions: 0, redemptionsNet: 0 };
        e.couponsGross += f.grossCoupon;
        e.couponsNet += f.grossCoupon - f.couponTax;
        e.redemptions += f.principal;
        e.redemptionsNet += f.principal - f.gainTax;
        byYear.set(y, e);
      }
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }

  // ------------------------------------------------------------ scenari

  /**
   * Variazione immediata del controvalore (tel quel) per ogni titolo e per il
   * portafoglio. nodesBp: spostamenti in punti base a 2, 10 e 30 anni.
   */
  function scenarioPnL(rows, nodesBp) {
    const items = rows.map((r) => {
      const shift = curveShift(nodesBp, r.years);
      const after = (r.pos.nominal / 100) * B.dirtyFromYield(r.bond, B.shiftEffective(r.ytm, r.bond.freq, shift));
      const pnl = after - r.marketValue;
      return { shift, pnl, pct: pnl / r.marketValue };
    });
    const mv = rows.reduce((s, r) => s + r.marketValue, 0);
    const pnl = items.reduce((s, x) => s + x.pnl, 0);
    return { items, total: { pnl, pct: mv ? pnl / mv : 0 } };
  }

  /**
   * Rendimento in `years` anni se oggi i rendimenti si spostano secondo lo
   * scenario e restano lì: cedole incassate (senza reinvestimento) più vendita
   * all'orizzonte, rispetto a quanto speso. Ogni titolo mantiene il proprio
   * rendimento più lo spostamento (nessun effetto di scorrimento sulla curva).
   */
  function scenarioHorizon(rows, nodesBp, years, settlement) {
    const horizon = B.addYears(settlement, years);
    const sum = { costGross: 0, costNet: 0, valueGross: 0, valueNet: 0 };
    const items = rows.map((r) => {
      const shift = curveShift(nodesBp, r.years);
      const v = B.horizonValue(r.bond, r.opts, horizon, B.shiftEffective(r.ytm, r.bond.freq, shift));
      for (const k in sum) sum[k] += v[k];
      return { shift, gross: v.valueGross / v.costGross - 1, net: v.valueNet / v.costNet - 1 };
    });
    return {
      horizon,
      items,
      total: { gross: sum.valueGross / sum.costGross - 1, net: sum.valueNet / sum.costNet - 1 },
    };
  }

  return { SCENARIOS, NODE_YEARS, curveShift, xirr, analyzePosition, analyzePortfolio, portfolioBreakEven, cashflowCalendar, scenarioPnL, scenarioHorizon };
});
