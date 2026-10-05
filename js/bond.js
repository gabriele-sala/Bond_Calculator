/*
 * Motore di calcolo obbligazionario.
 *
 * Convenzioni:
 *  - Prezzi espressi per 100 di nominale.
 *  - Tassi espressi in forma decimale (0.035 = 3,5%).
 *  - Date come oggetti Date UTC a mezzanotte.
 *  - Calendario cedolare regolare generato a ritroso dalla scadenza
 *    (regola di fine mese se la scadenza cade l'ultimo giorno del mese).
 *  - Rendimento a scadenza con capitalizzazione composta alla frequenza
 *    cedolare (convenzione ICMA), esponenti DSC/E + (k - 1) come Excel YIELD/PRICE.
 *
 * Il file funziona sia nel browser (globale `Bond`) sia in Node (`require`).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Bond = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MS_DAY = 86400000;

  // ---------------------------------------------------------------- date

  function ymd(y, m, d) {
    return new Date(Date.UTC(y, m - 1, d));
  }

  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    return ymd(y, mo, d);
  }

  function toISO(dt) {
    return dt.toISOString().slice(0, 10);
  }

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function isLastDayOfMonth(dt) {
    return dt.getUTCDate() === daysInMonth(dt.getUTCFullYear(), dt.getUTCMonth() + 1);
  }

  function addMonths(dt, n, endOfMonth) {
    const total = dt.getUTCMonth() + n;
    const y = dt.getUTCFullYear() + Math.floor(total / 12);
    const m = (((total % 12) + 12) % 12) + 1;
    const dim = daysInMonth(y, m);
    return ymd(y, m, endOfMonth ? dim : Math.min(dt.getUTCDate(), dim));
  }

  function addYears(dt, n) {
    return addMonths(dt, 12 * n, false);
  }

  function actualDays(a, b) {
    return Math.round((b - a) / MS_DAY);
  }

  // ---------------------------------------------------------- day count

  function parts(dt) {
    return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  }

  // 30/360 US (NASD / Bond Basis), con la regola di fine febbraio.
  function days30US(a, b) {
    let [y1, m1, d1] = parts(a);
    let [y2, m2, d2] = parts(b);
    const aLastFeb = m1 === 2 && d1 === daysInMonth(y1, 2);
    const bLastFeb = m2 === 2 && d2 === daysInMonth(y2, 2);
    if (aLastFeb && bLastFeb) d2 = 30;
    if (aLastFeb) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
    if (d1 === 31) d1 = 30;
    return 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1);
  }

  // 30E/360 (Eurobond basis).
  function days30E(a, b) {
    let [y1, m1, d1] = parts(a);
    let [y2, m2, d2] = parts(b);
    if (d1 === 31) d1 = 30;
    if (d2 === 31) d2 = 30;
    return 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1);
  }

  const DAY_COUNTS = {
    'ACT/ACT': {
      label: 'ACT/ACT (ICMA)',
      days: actualDays,
      periodLength: (prev, next) => actualDays(prev, next),
    },
    '30/360': {
      label: '30/360 US',
      days: days30US,
      periodLength: (prev, next, f) => 360 / f,
    },
    '30E/360': {
      label: '30E/360',
      days: days30E,
      periodLength: (prev, next, f) => 360 / f,
    },
    'ACT/360': {
      label: 'ACT/360',
      days: actualDays,
      periodLength: (prev, next, f) => 360 / f,
    },
    'ACT/365': {
      label: 'ACT/365 Fixed',
      days: actualDays,
      periodLength: (prev, next, f) => 365 / f,
    },
  };

  // ----------------------------------------------------- calendario cedole

  // Restituisce la data cedola precedente (o uguale) al regolamento e tutte
  // le date cedola successive, in ordine crescente; l'ultima è la scadenza.
  function couponSchedule(settlement, maturity, freq) {
    const step = 12 / freq;
    const eom = isLastDayOfMonth(maturity);
    const dates = [maturity];
    let k = 1;
    let d = addMonths(maturity, -step, eom);
    while (d > settlement) {
      dates.unshift(d);
      k += 1;
      d = addMonths(maturity, -step * k, eom);
    }
    return { prev: d, dates };
  }

  // ------------------------------------------------------- obbligazione

  function validate(p) {
    const errors = [];
    if (!p.settlement) errors.push('Inserisci una data di regolamento valida.');
    if (!p.maturity) errors.push('Inserisci una data di scadenza valida.');
    if (p.settlement && p.maturity && p.maturity <= p.settlement)
      errors.push('La scadenza deve essere successiva alla data di regolamento.');
    if (![1, 2, 4, 12].includes(p.freq)) errors.push('Frequenza cedolare non supportata.');
    if (!DAY_COUNTS[p.dayCount]) errors.push('Convenzione di calcolo giorni non supportata.');
    if (!Number.isFinite(p.couponRate) || p.couponRate < 0)
      errors.push('La cedola deve essere un numero maggiore o uguale a zero.');
    if (!Number.isFinite(p.redemption) || p.redemption <= 0)
      errors.push('Il prezzo di rimborso deve essere maggiore di zero.');
    return errors;
  }

  /**
   * Costruisce l'obbligazione a partire dai parametri.
   * p = { settlement: Date, maturity: Date, couponRate: decimale annuo,
   *       freq: 1|2|4|12, redemption: per 100, dayCount: chiave di DAY_COUNTS }
   */
  function createBond(p) {
    const errors = validate(p);
    if (errors.length) {
      const err = new Error(errors[0]);
      err.errors = errors;
      throw err;
    }
    const f = p.freq;
    const dc = DAY_COUNTS[p.dayCount];
    const { prev, dates } = couponSchedule(p.settlement, p.maturity, f);
    const next = dates[0];

    const E = dc.periodLength(prev, next, f);
    const A = dc.days(prev, p.settlement);
    const DSC = p.dayCount.startsWith('30') ? E - A : actualDays(p.settlement, next);

    const coupon = (100 * p.couponRate) / f;
    const accrued = coupon * (A / E);

    // Tempo (in periodi cedolari) dal regolamento a una data qualsiasi
    // fino alla scadenza, coerente con la convenzione scelta.
    const firstT = DSC / E;
    function timeTo(date) {
      if (date <= next) {
        return (dc.days(prev, date) - A) / E;
      }
      let left = next;
      for (let j = 1; j < dates.length; j++) {
        const right = dates[j];
        if (date <= right) {
          const Ej = dc.periodLength(left, right, f);
          return firstT + (j - 1) + dc.days(left, date) / Ej;
        }
        left = right;
      }
      return firstT + dates.length - 1;
    }

    const cashflows = dates.map((date, i) => {
      const principal = i === dates.length - 1 ? p.redemption : 0;
      return {
        date,
        coupon,
        principal,
        amount: coupon + principal,
        t: firstT + i,
      };
    });

    return {
      params: p,
      freq: f,
      dayCount: p.dayCount,
      prevCoupon: prev,
      nextCoupon: next,
      E,
      A,
      DSC,
      accruedFraction: A / E,
      couponPerPeriod: coupon,
      accrued,
      cashflows,
      timeTo,
      yearsToMaturity: cashflows[cashflows.length - 1].t / f,
    };
  }

  // -------------------------------------------------- prezzo / rendimento

  function dirtyFromYield(bond, y) {
    const v = 1 + y / bond.freq;
    let pv = 0;
    for (const cf of bond.cashflows) pv += cf.amount * Math.pow(v, -cf.t);
    return pv;
  }

  function cleanFromYield(bond, y) {
    return dirtyFromYield(bond, y) - bond.accrued;
  }

  function dPdY(flows, y, f) {
    const v = 1 + y / f;
    let s = 0;
    for (const cf of flows) s += (-cf.t / f) * cf.amount * Math.pow(v, -cf.t - 1);
    return s;
  }

  // Risolve sum(amount * (1+y/f)^-t) = target per y (Newton + bisezione).
  function solveRate(flows, f, target) {
    const pv = (y) => {
      const v = 1 + y / f;
      let s = 0;
      for (const cf of flows) s += cf.amount * Math.pow(v, -cf.t);
      return s - target;
    };
    // Newton
    let y = 0.05;
    for (let i = 0; i < 50; i++) {
      const fy = pv(y);
      if (Math.abs(fy) < 1e-12 * Math.max(1, Math.abs(target))) return y;
      const d = dPdY(flows, y, f);
      if (!Number.isFinite(d) || d === 0) break;
      const ny = y - fy / d;
      if (!Number.isFinite(ny) || ny <= -f * 0.999) break;
      if (Math.abs(ny - y) < 1e-14) return ny;
      y = ny;
    }
    // Bisezione di riserva
    let lo = -f * 0.999 + 1e-9;
    let hi = 1;
    while (pv(hi) > 0 && hi < 1e6) hi *= 2;
    if (pv(lo) < 0 || pv(hi) > 0) return NaN;
    for (let i = 0; i < 300; i++) {
      const mid = (lo + hi) / 2;
      if (pv(mid) > 0) lo = mid;
      else hi = mid;
      if (hi - lo < 1e-15) break;
    }
    return (lo + hi) / 2;
  }

  function yieldFromDirty(bond, dirty) {
    if (!(dirty > 0)) return NaN;
    return solveRate(bond.cashflows, bond.freq, dirty);
  }

  function yieldFromClean(bond, clean) {
    return yieldFromDirty(bond, clean + bond.accrued);
  }

  // Conversione fra tasso nominale (capitalizzato f volte) ed effettivo annuo.
  function nominalToEffective(y, f) {
    return Math.pow(1 + y / f, f) - 1;
  }

  function effectiveToNominal(r, f) {
    return f * (Math.pow(1 + r, 1 / f) - 1);
  }

  // ------------------------------------------------------------- rischio

  function risk(bond, y) {
    const f = bond.freq;
    const v = 1 + y / f;
    let P = 0, sumT = 0, sumC = 0;
    for (const cf of bond.cashflows) {
      const pv = cf.amount * Math.pow(v, -cf.t);
      P += pv;
      sumT += (cf.t / f) * pv;
      sumC += ((cf.t * (cf.t + 1)) / (f * f)) * pv;
    }
    const macaulay = sumT / P;
    const modified = macaulay / v;
    const convexity = sumC / (P * v * v);
    return {
      dirty: P,
      macaulay,
      modified,
      convexity,
      // Variazione di prezzo (per 100) per +1 punto base.
      dv01: modified * P * 0.0001,
    };
  }

  // ------------------------------------------------- rendimento netto

  /**
   * Flussi per l'investitore su un nominale `nominal`, comprese tasse,
   * commissioni e (opzionale) imposta di bollo. Stima secondo la prassi
   * italiana (regime amministrato):
   *  - ritenuta sulle cedole; sulla prima cedola solo sulla parte maturata
   *    dopo l'acquisto (il rateo pagato al venditore è scomputato);
   *  - plusvalenza a scadenza = rimborso - (prezzo secco + commissioni);
   *    nessun credito d'imposta sulle minusvalenze;
   *  - bollo 0,20% annuo sul controvalore (prezzo stimato con avvicinamento
   *    lineare al rimborso), addebitato a ogni anniversario e pro rata a scadenza.
   */
  function investorFlows(bond, opts) {
    const Q = opts.nominal / 100;
    const tax = opts.taxRate || 0;
    const commission = opts.commission || 0;
    const clean = opts.cleanPrice;
    const out = [];

    const purchaseCost = Q * (clean + bond.accrued) + commission;
    out.push({ date: bond.params.settlement, t: 0, amount: -purchaseCost, kind: 'acquisto' });

    const accruedPaid = Q * bond.accrued;
    bond.cashflows.forEach((cf, i) => {
      const grossCoupon = Q * cf.coupon;
      const taxable = i === 0 ? Math.max(0, grossCoupon - accruedPaid) : grossCoupon;
      const couponTax = tax * taxable;
      let gainTax = 0;
      if (cf.principal) {
        const gain = Q * cf.principal - (Q * clean + commission);
        gainTax = tax * Math.max(0, gain);
      }
      out.push({
        date: cf.date,
        t: cf.t,
        amount: grossCoupon + Q * cf.principal - couponTax - gainTax,
        kind: 'flusso',
        grossCoupon,
        principal: Q * cf.principal,
        couponTax,
        gainTax,
      });
    });

    if (opts.stampDuty) {
      const maturity = bond.params.maturity;
      const settle = bond.params.settlement;
      const totalT = bond.cashflows[bond.cashflows.length - 1].t;
      const priceAt = (t) => clean + (bond.params.redemption - clean) * (t / totalT);
      let start = settle;
      for (let k = 1; start < maturity; k++) {
        const anniversary = addYears(settle, k);
        const end = anniversary < maturity ? anniversary : maturity;
        const yearFrac = actualDays(start, end) / 365;
        const tEnd = bond.timeTo(end);
        const tStart = bond.timeTo(start);
        const avgPrice = (priceAt(tStart) + priceAt(tEnd)) / 2;
        out.push({
          date: end,
          t: tEnd,
          amount: -0.002 * Q * avgPrice * yearFrac,
          kind: 'bollo',
        });
        start = end;
      }
    }
    return out;
  }

  // Rendimento effettivo annuo dei flussi dell'investitore (TIR).
  function investorYield(bond, opts) {
    const flows = investorFlows(bond, opts);
    const outlay = -flows[0].amount;
    const rest = flows.slice(1);
    const y = solveRate(rest, bond.freq, outlay);
    return { nominal: y, effective: nominalToEffective(y, bond.freq), flows };
  }

  // ------------------------------------------- orizzonte e pareggio

  /**
   * Valore della posizione a una data futura: cedole incassate fino a quella
   * data (comprese quelle pagate quel giorno, senza reinvestimento) più la
   * vendita del titolo al rendimento nominale `yHorizon`. Se la data è la
   * scadenza o oltre, il titolo è tenuto fino al rimborso.
   * Il netto segue le regole di investorFlows: ritenuta sulle cedole (la prima
   * solo per la parte maturata dopo l'acquisto), sul rateo maturato alla
   * vendita e sulla plusvalenza sul prezzo secco al netto delle commissioni;
   * bollo opzionale sul controvalore medio del periodo.
   * opts: { nominal, cleanPrice, taxRate, commission, stampDuty }
   * Restituisce importi in euro: { costGross, costNet, valueGross, valueNet }.
   */
  function horizonValue(bond, opts, horizonDate, yHorizon) {
    const Q = opts.nominal / 100;
    const tax = opts.taxRate || 0;
    const commission = opts.commission || 0;
    const clean0 = opts.cleanPrice;
    const settle = bond.params.settlement;
    const maturity = bond.params.maturity;
    const costGross = Q * (clean0 + bond.accrued);
    const costNet = costGross + commission;

    let valueGross = 0;
    let valueNet = 0;
    let couponsReceived = 0;
    bond.cashflows.forEach((cf, i) => {
      if (cf.date > horizonDate) return;
      const gross = Q * cf.coupon;
      const taxable = i === 0 ? Math.max(0, gross - Q * bond.accrued) : gross;
      valueGross += gross;
      valueNet += gross - tax * taxable;
      couponsReceived++;
    });

    let cleanEnd;
    if (horizonDate >= maturity) {
      const redemption = Q * bond.params.redemption;
      cleanEnd = bond.params.redemption;
      valueGross += redemption;
      valueNet += redemption - tax * Math.max(0, redemption - (Q * clean0 + commission));
    } else {
      const later = createBond({ ...bond.params, settlement: horizonDate });
      cleanEnd = cleanFromYield(later, yHorizon);
      const accruedEnd = Q * later.accrued;
      const proceeds = Q * cleanEnd + accruedEnd;
      // Interessi maturati nel periodo cedolare in corso, dopo l'acquisto.
      const accruedIncome = couponsReceived ? accruedEnd : accruedEnd - Q * bond.accrued;
      const gain = Q * cleanEnd - (Q * clean0 + commission);
      valueGross += proceeds;
      valueNet += proceeds - tax * Math.max(0, accruedIncome) - tax * Math.max(0, gain);
    }

    if (opts.stampDuty) {
      const end = horizonDate < maturity ? horizonDate : maturity;
      const years = actualDays(settle, end) / 365;
      valueNet -= 0.002 * Q * ((clean0 + cleanEnd) / 2) * years;
    }
    return { costGross, costNet, valueGross, valueNet };
  }

  // Ricerca per bisezione della radice di una funzione decrescente.
  function bisectDecreasing(fn, lo, hi, tol) {
    let flo = fn(lo), fhi = fn(hi);
    if (flo < 0) return -Infinity;
    if (fhi > 0) return Infinity;
    for (let i = 0; i < 200 && hi - lo > tol; i++) {
      const mid = (lo + hi) / 2;
      if (fn(mid) >= 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /**
   * Rialzo di pareggio: di quanto può salire il rendimento del titolo entro
   * `years` anni perché cedole incassate e vendita restituiscano almeno quanto
   * speso. In decimale (0,004 = +40 pb), lordo e netto; null se l'orizzonte
   * arriva alla scadenza o oltre.
   */
  function breakEvenShift(bond, opts, y0, years) {
    const horizon = addYears(bond.params.settlement, years);
    if (horizon >= bond.params.maturity) return null;
    const lo = Math.max(-0.5, -bond.freq * 0.99 - y0);
    const hi = 1;
    const at = (d) => horizonValue(bond, opts, horizon, y0 + d);
    return {
      horizon,
      gross: bisectDecreasing((d) => { const v = at(d); return v.valueGross - v.costGross; }, lo, hi, 1e-9),
      net: bisectDecreasing((d) => { const v = at(d); return v.valueNet - v.costNet; }, lo, hi, 1e-9),
    };
  }

  /**
   * Tempo di recupero: se il rendimento del titolo sale subito di `shift`
   * (decimale) e resta lì, primo giorno in cui cedole incassate e prezzo di
   * vendita tornano a quanto speso. Restituisce { gross, net } con la data e
   * la durata in anni, oppure null se non succede entro la scadenza.
   */
  function recoveryTime(bond, opts, y0, shift) {
    const y = y0 + shift;
    const settle = bond.params.settlement;
    const maturity = bond.params.maturity;
    const find = (key) => {
      const ok = (date) => {
        const v = horizonValue(bond, opts, date, y);
        return key === 'gross' ? v.valueGross >= v.costGross - 1e-9 : v.valueNet >= v.costNet - 1e-9;
      };
      if (ok(settle)) return { date: settle, years: 0 };
      // Prima un passo mensile, poi bisezione sui giorni.
      let prev = settle;
      for (let m = 1; ; m++) {
        let date = addMonths(settle, m, false);
        if (date > maturity) date = maturity;
        if (ok(date)) {
          let lo = 0, hi = actualDays(prev, date);
          while (hi - lo > 1) {
            const mid = Math.floor((lo + hi) / 2);
            if (ok(new Date(prev.getTime() + mid * MS_DAY))) hi = mid;
            else lo = mid;
          }
          const hit = new Date(prev.getTime() + hi * MS_DAY);
          return { date: hit, years: actualDays(settle, hit) / 365.25 };
        }
        if (date >= maturity) return null;
        prev = date;
      }
    };
    return { gross: find('gross'), net: find('net') };
  }

  // ----------------------------------------------------------- analisi

  /**
   * Analisi completa. input = parametri di createBond più
   *  { mode: 'price' | 'yield', cleanPrice, yield (nominale), call?: {date, price},
   *    nominal, taxRate, commission, stampDuty }
   */
  function analyze(input) {
    const bond = createBond(input);
    let y, clean;
    if (input.mode === 'yield') {
      y = input.yield;
      if (!Number.isFinite(y) || y <= -bond.freq) throw new Error('Rendimento non valido.');
      clean = cleanFromYield(bond, y);
    } else {
      clean = input.cleanPrice;
      if (!Number.isFinite(clean) || clean <= 0) throw new Error('Il prezzo deve essere maggiore di zero.');
      y = yieldFromClean(bond, clean);
      if (!Number.isFinite(y)) throw new Error('Impossibile calcolare il rendimento con questi dati.');
    }
    const dirty = clean + bond.accrued;
    const r = risk(bond, y);
    const annualCoupon = 100 * input.couponRate;

    const result = {
      bond,
      clean,
      dirty,
      accrued: bond.accrued,
      ytm: y,
      ytmEffective: nominalToEffective(y, bond.freq),
      currentYield: annualCoupon / clean,
      risk: r,
    };

    if (input.call && input.call.date) {
      if (input.call.date <= input.settlement || input.call.date >= input.maturity) {
        result.callError = 'La data di call deve cadere fra il regolamento e la scadenza.';
      } else {
        const callBond = createBond({
          ...input,
          maturity: input.call.date,
          redemption: input.call.price,
        });
        const ytc = yieldFromDirty(callBond, dirty);
        result.ytc = ytc;
        result.ytcEffective = nominalToEffective(ytc, bond.freq);
        result.ytw = Math.min(y, ytc);
      }
    }

    if (input.nominal > 0) {
      const opts = {
        nominal: input.nominal,
        cleanPrice: clean,
        taxRate: input.taxRate || 0,
        commission: input.commission || 0,
        stampDuty: !!input.stampDuty,
      };
      result.investor = investorYield(bond, opts);
      result.investor.cost = -result.investor.flows[0].amount;
      result.investor.received = result.investor.flows
        .slice(1)
        .reduce((s, x) => s + x.amount, 0);
    }
    return result;
  }

  // Scenari di variazione del rendimento: prezzo esatto vs. stime.
  function scenarios(bond, y, shiftsBp) {
    const r = risk(bond, y);
    return shiftsBp.map((bp) => {
      const dy = bp / 10000;
      const dirty = dirtyFromYield(bond, y + dy);
      const durEst = r.dirty * (1 - r.modified * dy);
      const convEst = r.dirty * (1 - r.modified * dy + 0.5 * r.convexity * dy * dy);
      return {
        bp,
        yield: y + dy,
        clean: dirty - bond.accrued,
        dirty,
        change: dirty / r.dirty - 1,
        durationEstimate: durEst - bond.accrued,
        convexityEstimate: convEst - bond.accrued,
      };
    });
  }

  return {
    DAY_COUNTS,
    ymd,
    parseDate,
    toISO,
    addMonths,
    actualDays,
    days30US,
    days30E,
    couponSchedule,
    createBond,
    dirtyFromYield,
    cleanFromYield,
    yieldFromDirty,
    yieldFromClean,
    nominalToEffective,
    effectiveToNominal,
    risk,
    investorFlows,
    investorYield,
    analyze,
    scenarios,
    addYears,
    horizonValue,
    breakEvenShift,
    recoveryTime,
  };
});
