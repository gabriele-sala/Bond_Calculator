(function () {
  'use strict';

  const B = window.Bond;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'bondcalc:v1';

  // ------------------------------------------------------------ formati

  const nf = (min, max) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: min, maximumFractionDigits: max });
  const fmt = {};
  [0, 1, 2, 3, 4, 6].forEach((d) => (fmt[d] = nf(d, d)));
  const upTo2 = nf(0, 2);
  const num = (x, d = 2) => (Number.isFinite(x) ? fmt[d].format(x) : '–');
  const pct = (x, d = 3) => (Number.isFinite(x) ? fmt[d].format(x * 100) + '%' : '–');
  const eur = (x) => (Number.isFinite(x) ? fmt[2].format(x) + ' €' : '–');
  const signed = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + num(Math.abs(x), d);
  const dateIt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fdate = (dt) => dateIt.format(dt);
  const FREQ_LABEL = { 1: 'annuale', 2: 'semestrale', 4: 'trimestrale', 12: 'mensile' };
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Accetta sia "1.234,56" sia "1234.56". Per gli importi in euro
  // "10.000" è letto come diecimila.
  function parseNum(s, amount) {
    let t = String(s == null ? '' : s).trim().replace(/\s|€|%/g, '');
    if (!t) return NaN;
    if (t.includes(',') || (amount && /^\d{1,3}(\.\d{3})+$/.test(t))) t = t.replace(/\./g, '').replace(',', '.');
    return /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
  }
  const show = (x, d) => (Number.isFinite(x) ? String(+x.toFixed(d)).replace('.', ',') : '');

  // ------------------------------------------------------------- date

  function todayUTC() {
    const n = new Date();
    return B.ymd(n.getFullYear(), n.getMonth() + 1, n.getDate());
  }
  // Regolamento standard T+2 giorni lavorativi.
  function defaultSettlement() {
    let d = todayUTC();
    let added = 0;
    while (added < 2) {
      d = new Date(d.getTime() + 86400000);
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) added++;
    }
    return d;
  }

  // ------------------------------------------------------------ esempi

  function presets() {
    const s = defaultSettlement();
    const y = s.getUTCFullYear();
    return {
      btp: { maturity: B.ymd(y + 9, 2, 1), coupon: 3.85, freq: 2, daycount: 'ACT/ACT', redemption: 100, price: 101.35, tax: '0.125', call: null },
      corp: { maturity: B.ymd(y + 6, 11, 15), coupon: 5.25, freq: 2, daycount: '30/360', redemption: 100, price: 98.75, tax: '0.26', call: null },
      zero: { maturity: B.addMonths(s, 24, false), coupon: 0, freq: 1, daycount: 'ACT/ACT', redemption: 100, price: 94.8, tax: '0.26', call: null },
      call: { maturity: B.ymd(y + 8, 6, 15), coupon: 6, freq: 1, daycount: 'ACT/ACT', redemption: 100, price: 104.5, tax: '0.26', call: { date: B.ymd(y + 3, 6, 15), price: 100 } },
    };
  }

  function applyPreset(key) {
    const p = presets()[key];
    if (!p) return;
    $('settlement').value = B.toISO(defaultSettlement());
    $('maturity').value = B.toISO(p.maturity);
    $('coupon').value = show(p.coupon, 4);
    $('freq').value = String(p.freq);
    $('daycount').value = p.daycount;
    $('redemption').value = show(p.redemption, 4);
    $('mode-price').checked = true;
    $('price').value = show(p.price, 4);
    $('tax').value = p.tax;
    $('calldate').value = p.call ? B.toISO(p.call.date) : '';
    $('callprice').value = p.call ? show(p.call.price, 4) : '';
    $('call-details').open = !!p.call;
  }

  // ------------------------------------------------------ stato modulo

  const FIELDS = ['isin', 'settlement', 'maturity', 'coupon', 'freq', 'daycount', 'redemption', 'price', 'yield', 'yieldbasis', 'nominal', 'commission', 'tax', 'taxcustom', 'calldate', 'callprice'];

  function save() {
    try {
      const state = {};
      FIELDS.forEach((f) => (state[f] = $(f).value));
      state.mode = mode();
      state.stamp = $('stamp').checked;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* archiviazione non disponibile */ }
  }

  function restore() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!state) return false;
      FIELDS.forEach((f) => { if (typeof state[f] === 'string') $(f).value = state[f]; });
      $('mode-' + (state.mode === 'yield' ? 'yield' : 'price')).checked = true;
      $('stamp').checked = !!state.stamp;
      $('call-details').open = !!state.calldate;
      return true;
    } catch (e) {
      return false;
    }
  }

  const mode = () => (document.querySelector('input[name="mode"]:checked') || {}).value || 'price';

  function syncVisibility() {
    const m = mode();
    $('price-field').hidden = m !== 'price';
    $('yield-field').hidden = m !== 'yield';
    $('taxcustom-field').hidden = $('tax').value !== 'custom';
  }

  function readInput() {
    const errors = [];
    const mark = (id, bad) => $(id).setAttribute('aria-invalid', bad ? 'true' : 'false');
    const need = (id, label, opts = {}) => {
      const v = parseNum($(id).value, opts.amount);
      const bad = !Number.isFinite(v) || (opts.min != null && v < opts.min) || (opts.gt != null && v <= opts.gt);
      mark(id, bad);
      if (bad) errors.push(label);
      return v;
    };

    const settlement = B.parseDate($('settlement').value);
    const maturity = B.parseDate($('maturity').value);
    mark('settlement', !settlement);
    mark('maturity', !maturity);
    if (!settlement) errors.push('Inserisci la data di regolamento.');
    if (!maturity) errors.push('Inserisci la data di scadenza.');

    const freq = Number($('freq').value);
    const coupon = need('coupon', 'La cedola deve essere un numero, ad esempio 3,85.', { min: 0 });
    const redemption = need('redemption', 'Il prezzo di rimborso deve essere maggiore di zero, di solito 100.', { gt: 0 });
    const m = mode();

    const input = {
      settlement,
      maturity,
      couponRate: coupon / 100,
      freq,
      redemption,
      dayCount: $('daycount').value,
      mode: m,
    };

    const priceEmpty = m === 'price' && $('price').value.trim() === '';
    $('price-default').hidden = !priceEmpty;
    if (priceEmpty) {
      // Senza prezzo inserito si calcola alla pari, come valore iniziale.
      input.cleanPrice = 100;
      input.priceDefaulted = true;
      mark('price', false);
    } else if (m === 'price') {
      input.cleanPrice = need('price', 'Il prezzo di acquisto deve essere un numero maggiore di zero, ad esempio 98,50.', { gt: 0 });
    } else {
      const yv = need('yield', 'Il rendimento deve essere un numero, ad esempio 3,5.');
      const y = yv / 100;
      input.yield = $('yieldbasis').value === 'eff' ? B.effectiveToNominal(y, freq) : y;
      if (Number.isFinite(y) && y <= -1) errors.push('Il rendimento deve essere maggiore di -100%.');
    }

    input.nominal = need('nominal', 'Il valore nominale deve essere maggiore di zero, ad esempio 10.000.', { gt: 0, amount: true });
    const comm = $('commission').value.trim() === '' ? 0 : need('commission', 'Le commissioni devono essere un importo, anche 0.', { min: 0, amount: true });
    input.commission = comm;
    if ($('tax').value === 'custom') {
      input.taxRate = need('taxcustom', 'L\'aliquota deve essere fra 0 e 100.', { min: 0 }) / 100;
      if (input.taxRate > 1) errors.push('L\'aliquota deve essere fra 0 e 100.');
    } else {
      $('taxcustom').setAttribute('aria-invalid', 'false');
      input.taxRate = Number($('tax').value);
    }
    input.stampDuty = $('stamp').checked;

    const callDate = B.parseDate($('calldate').value);
    if (callDate) {
      const cp = need('callprice', 'Il prezzo di call deve essere maggiore di zero.', { gt: 0 });
      input.call = { date: callDate, price: cp };
    } else {
      $('callprice').setAttribute('aria-invalid', 'false');
    }
    return { input, errors };
  }

  // ------------------------------------------------------------ calcolo

  let last = null;

  function compute() {
    syncVisibility();
    const { input, errors } = readInput();
    let result;
    if (!errors.length) {
      try {
        result = B.analyze(input);
      } catch (e) {
        errors.push(e.message);
      }
    }
    if (errors.length) {
      $('error').textContent = errors[0];
      $('error').hidden = false;
      $('output').style.opacity = '0.35';
      last = null;
      updateDock();
      return;
    }
    $('error').hidden = true;
    $('output').style.opacity = '';
    last = { input, result };
    render(input, result);
    save();
  }

  // ----------------------------------------------------------- rendering

  function taxLabel(input) {
    const parts = [];
    parts.push(input.taxRate > 0 ? 'imposte ' + upTo2.format(input.taxRate * 100) + '%' : 'senza imposte');
    if (input.commission > 0) parts.push('commissioni');
    if (input.stampDuty) parts.push('bollo');
    return 'dopo ' + parts.join(', ');
  }

  function render(input, r) {
    const b = r.bond;
    const f = b.freq;
    const inv = r.investor;

    $('r-eff').textContent = pct(r.ytmEffective);
    $('r-ytm').textContent = 'effettivo annuo · YTM ' + pct(r.ytm) + ' ' + FREQ_LABEL[f];
    $('r-net').textContent = pct(inv.effective);
    $('r-net-sub').textContent = 'effettivo annuo, ' + taxLabel(input);
    $('r-dirty').textContent = num(r.dirty, 4);
    $('r-dirty-sub').textContent = 'secco ' + num(r.clean, 4) + ' + rateo ' + num(r.accrued, 4);
    $('r-mod').textContent = num(r.risk.modified, 2);
    $('r-mod-sub').textContent = 'Macaulay ' + num(r.risk.macaulay, 2) + ' anni';
    // DV01 tecnico per 100 di nominale e la sua traduzione in euro su 100.000 € nominali.
    $('r-dv01').textContent = num(r.risk.dv01, 4);
    $('r-dv01-sub').textContent = 'Su 100.000 € nominali, +1 pb di rendimento ≈ variazione di circa −' + num(r.risk.dv01 * 1000, 2) + ' €';

    const Q = input.nominal / 100;
    const yieldFacts = [
      ['Rendimento corrente', pct(r.currentYield)],
      ['YTM nominale (' + FREQ_LABEL[f] + ')', pct(r.ytm, 4)],
      ['Rendimento effettivo lordo', pct(r.ytmEffective, 4)],
      ['Rendimento netto stimato', pct(inv.effective, 4)],
    ];
    if (r.callError) yieldFacts.push(['Yield to call', r.callError]);
    else if (Number.isFinite(r.ytc)) {
      yieldFacts.push(['Yield to call (effettivo)', pct(r.ytcEffective, 4)]);
      yieldFacts.push(['Yield to worst (effettivo)', pct(B.nominalToEffective(r.ytw, f), 4)]);
    }
    const groups = [
      ['Prezzo', [
        ['Prezzo secco', num(r.clean, 4)],
        ['Rateo (' + upTo2.format(b.A) + '/' + upTo2.format(b.E) + ' gg)', num(r.accrued, 6)],
        ['Prezzo tel quel', num(r.dirty, 4)],
        ['Cedola precedente', fdate(b.prevCoupon)],
        ['Prossima cedola', fdate(b.nextCoupon)],
        ['Cedole residue', String(b.cashflows.length)],
      ]],
      ['Rendimento', yieldFacts],
      ['Rischio', [
        ['Vita residua', num(b.yearsToMaturity, 2) + ' anni'],
        ['Duration di Macaulay', num(r.risk.macaulay, 4) + ' anni'],
        ['Duration modificata', num(r.risk.modified, 4)],
        ['Convessità', num(r.risk.convexity, 2)],
        ['DV01 per 100', num(r.risk.dv01, 4)],
        ['DV01 sul nominale', eur(r.risk.dv01 * Q)],
      ]],
      ['Il tuo investimento', [
        ['Controvalore tel quel', eur(Q * r.dirty)],
        ['Esborso con commissioni', eur(inv.cost)],
        ['Incassi netti totali', eur(inv.received)],
        ['Guadagno netto', eur(inv.received - inv.cost)],
      ]],
    ];
    $('facts').innerHTML = groups
      .map(([title, rows]) => `<section class="fact-group"><h3>${title}</h3><dl class="facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>`)
      .join('');

    renderWaterfall(input, r);
    updateDock(r);
    drawRosette(b, input);
    renderImpacts(input, r);
    renderBreakEven(input, r);
    renderScenarios(r);
    renderCashflows(input, r);
    drawChart();
  }

  // Scompone la differenza fra rendimento lordo e netto, un costo alla volta.
  function renderWaterfall(input, r) {
    const b = r.bond;
    const base = { nominal: input.nominal, cleanPrice: r.clean };
    const gross = r.ytmEffective;
    const afterTax = B.investorYield(b, { ...base, taxRate: input.taxRate }).effective;
    const afterComm = B.investorYield(b, { ...base, taxRate: input.taxRate, commission: input.commission }).effective;
    const net = r.investor.effective;
    const rows = [
      { kind: 'total', label: 'Rendimento lordo', from: 0, to: gross, text: pct(gross) },
      { kind: 'cut', label: 'Imposte', note: input.taxRate > 0 ? 'aliquota ' + upTo2.format(input.taxRate * 100) + '%' : 'nessuna', on: input.taxRate > 0, from: afterTax, to: gross },
      { kind: 'cut', label: 'Commissioni', note: input.commission > 0 ? eur(input.commission) : 'nessuna', on: input.commission > 0, from: afterComm, to: afterTax },
      { kind: 'cut', label: 'Imposta di bollo', note: input.stampDuty ? '0,20% annuo' : 'non inclusa', on: input.stampDuty, from: net, to: afterComm },
      { kind: 'total', label: 'Rendimento netto stimato', from: 0, to: net, text: pct(net) },
    ];
    const lo = Math.min(0, gross, net, afterTax, afterComm);
    const hi = Math.max(0, gross, net, afterTax, afterComm) || 1;
    const x = (v) => ((v - lo) / (hi - lo)) * 100;
    $('waterfall').innerHTML = rows
      .map((w) => {
        const a = Math.min(w.from, w.to), z = Math.max(w.from, w.to);
        const off = w.kind === 'cut' && !w.on;
        const text = w.text || (off ? '–' : '−' + fmt[3].format((w.to - w.from) * 100) + '%');
        const bar = z - a > 0 ? `<div class="wf-bar" style="left:${x(a).toFixed(2)}%;width:${Math.max(0.4, x(z) - x(a)).toFixed(2)}%"></div>` : '';
        return `<div class="wf-row ${w.kind}${off ? ' off' : ''}"><div class="wf-label">${w.label}${w.note ? `<small>${w.note}</small>` : ''}</div><div class="wf-track">${bar}</div><div class="wf-value">${text}</div></div>`;
      })
      .join('');
  }

  // Riepilogo fisso in basso su telefono, nascosto quando i risultati sono visibili.
  let headlineVisible = true;
  function updateDock(r) {
    if (r) {
      $('dock-net').textContent = pct(r.investor.effective, 2);
      $('dock-gross').textContent = pct(r.ytmEffective, 2);
      $('dock-third').textContent = num(r.clean, 2);
    }
    $('dock').hidden = headlineVisible || !last;
  }

  // Rosetta guilloché, come sui certificati obbligazionari: i lobi sono le
  // cedole residue, l'ampiezza dell'onda cresce con la cedola.
  let rosetteKey = '';
  function drawRosette(b, input) {
    const canvas = $('rosette');
    if (!canvas || !canvas.clientWidth) return;
    const lobes = Math.max(6, Math.min(48, b.cashflows.length));
    const wave = 0.035 + Math.min(0.08, input.couponRate * 0.9);
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const size = canvas.clientWidth;
    const key = [lobes, wave.toFixed(4), ink, size].join('|');
    if (key === rosetteKey) return;
    rosetteKey = key;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.6;
    const c = size / 2;
    const bands = [
      { R: 0.86, a: wave, n: lobes, copies: 16, alpha: 0.7 },
      { R: 0.6, a: wave * 1.3, n: Math.max(5, Math.round(lobes * 0.75)), copies: 12, alpha: 0.55 },
      { R: 0.32, a: wave * 1.1, n: Math.max(4, Math.round(lobes / 2)), copies: 10, alpha: 0.45 },
    ];
    const steps = 720;
    for (const band of bands) {
      ctx.globalAlpha = band.alpha;
      for (let j = 0; j < band.copies; j++) {
        const phase = (j / band.copies) * Math.PI * 2;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          const rr = (band.R + band.a * Math.sin(band.n * t + phase) + band.a * 0.35 * Math.sin(3 * band.n * t - phase)) * c * 0.94;
          const px = c + rr * Math.cos(t), py = c + rr * Math.sin(t);
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function redrawRosette() {
    rosetteKey = '';
    if (last) drawRosette(last.result.bond, last.input);
  }

  // Variazioni di prezzo in evidenza sopra il grafico.
  function renderImpacts(input, r) {
    const Q = input.nominal / 100;
    const rows = B.scenarios(r.bond, r.ytm, [100, 200, -100], true);
    $('impacts').innerHTML = rows
      .map((s) => {
        const euro = Q * (s.dirty - r.dirty);
        const cls = s.change < 0 ? ' neg' : '';
        const what = s.bp > 0 ? `Se il rendimento sale di ${s.bp} pb` : `Se il rendimento scende di ${Math.abs(s.bp)} pb`;
        const kind = euro < 0 ? 'perdita immediata stimata' : 'guadagno immediato stimato';
        return `<div class="impact"><span class="impact-shift">${what}</span><span class="impact-value${cls}">${signed(s.change * 100, 1)}%</span><span class="impact-euro">${kind}: <b class="${cls.trim()}">${euro < 0 ? '−' : '+'}${num(Math.abs(euro), 0)} €</b></span></div>`;
      })
      .join('');
  }

  // Durata leggibile fra due date: "1 anno e 7 mesi", "8 mesi", "12 giorni".
  function spanIt(from, to) {
    const days = B.actualDays(from, to);
    if (days < 45) return days === 1 ? '1 giorno' : days + ' giorni';
    const months = Math.round(days / 30.4375);
    const y = Math.floor(months / 12), m = months % 12;
    const ys = y ? (y === 1 ? '1 anno' : y + ' anni') : '';
    const ms = m ? (m === 1 ? '1 mese' : m + ' mesi') : '';
    return ys && ms ? ys + ' e ' + ms : ys || ms;
  }

  const bpIt = (d) => (d > 0 ? '+' : d < 0 ? '−' : '') + num(Math.abs(d) * 1e4, 0) + ' pb';

  // Rialzo di pareggio a 1 e 3 anni e tempi di recupero dopo un rialzo improvviso.
  function renderBreakEven(input, r) {
    const b = r.bond;
    const opts = { nominal: input.nominal, cleanPrice: r.clean, taxRate: input.taxRate, commission: input.commission, stampDuty: input.stampDuty };
    const showNet = input.taxRate > 0 || input.commission > 0 || input.stampDuty;
    $('breakeven').innerHTML = [1, 3]
      .map((years) => {
        const label = years === 1 ? 'Fra 1 anno' : 'Fra 3 anni';
        const beNom = B.breakEvenShift(b, opts, r.ytm, years);
        if (!beNom) return `<div class="be"><span class="be-label">${label}</span><span class="be-value">–</span><span class="be-sub">Il titolo scade entro questa data.</span></div>`;
        // Rialzo espresso sul rendimento effettivo annuo, come in testata.
        const toEff = (dn) => (Number.isFinite(dn) ? B.nominalToEffective(r.ytm + dn, b.freq) - r.ytmEffective : dn);
        const be = { gross: toEff(beNom.gross), net: toEff(beNom.net) };
        const main = showNet ? be.net : be.gross;
        let value, sub;
        if (main === Infinity) {
          value = 'oltre +10.000 pb';
          sub = 'Con questa vita residua il prezzo quasi non risente dei tassi.';
        } else if (main === -Infinity) {
          value = 'nessun margine';
          sub = 'Anche a rendimenti invariati non recuperi i costi entro questa data.';
        } else {
          const level = r.ytmEffective + main;
          value = bpIt(main);
          sub = `Sei in pari finché il rendimento non supera il <b>${pct(level, 2)}</b>` +
            (showNet && Number.isFinite(be.gross) ? `. Al lordo: ${bpIt(be.gross)}.` : '.');
        }
        return `<div class="be"><span class="be-label">${label}${showNet ? ', netto stimato' : ''}</span><span class="be-value">${value}</span><span class="be-sub">${sub}</span></div>`;
      })
      .join('');

    const Q = input.nominal / 100;
    const settle = b.params.settlement;
    $('recovery').querySelector('tbody').innerHTML = B.scenarios(b, r.ytm, [50, 100, 200], true)
      .map((s) => {
        const rec = B.recoveryTime(b, opts, r.ytm, s.yield - r.ytm);
        const cell = (x) => (x ? (x.years === 0 ? 'subito' : spanIt(settle, x.date)) : 'non entro la scadenza');
        const loss = Q * (s.dirty - r.dirty);
        return `<tr><td>+${s.bp} pb</td><td><span class="neg">${signed(s.change * 100, 2)}% (−${num(Math.abs(loss), 0)} €)</span></td><td>${cell(rec.gross)}</td><td>${showNet ? cell(rec.net) : cell(rec.gross)}</td></tr>`;
      })
      .join('');
  }

  function renderScenarios(r) {
    const b = r.bond;
    const rows = B.scenarios(b, r.ytm, [-200, -100, -50, 0, 50, 100, 200], true);
    $('scenarios').querySelector('tbody').innerHTML = rows
      .map((s) => {
        const cls = s.bp === 0 ? ' class="now"' : '';
        const label = s.bp === 0 ? 'Attuale' : (s.bp > 0 ? '+' : '−') + Math.abs(s.bp) + ' pb';
        const valid = s.yield > -b.freq;
        return `<tr${cls}><td>${label}</td><td>${valid ? pct(B.nominalToEffective(s.yield, b.freq), 2) : '–'}</td><td>${num(s.clean, 3)}</td><td>${signed(s.change * 100, 2)}%</td><td>${num(s.durationEstimate, 3)}</td><td>${num(s.convexityEstimate, 3)}</td></tr>`;
      })
      .join('');
  }

  function renderCashflows(input, r) {
    const b = r.bond;
    const v = 1 + r.ytm / b.freq;
    const Q = input.nominal / 100;
    const flows = r.investor.flows.filter((x) => x.kind === 'flusso');
    const stamp = r.investor.flows.filter((x) => x.kind === 'bollo').reduce((s, x) => s + x.amount, 0);
    let tot = { g: 0, p: 0, t: 0, n: 0, pv: 0 };
    const rows = flows.map((x, i) => {
      const cf = b.cashflows[i];
      const pv = Q * cf.amount * Math.pow(v, -cf.t);
      const taxes = x.couponTax + x.gainTax;
      tot.g += x.grossCoupon; tot.p += x.principal; tot.t += taxes; tot.n += x.amount; tot.pv += pv;
      const redeem = x.principal > 0;
      return `<tr${redeem ? ' class="redeem"' : ''}><td>${redeem && x.grossCoupon === 0 ? 'Rimborso' : 'n. ' + (i + 1)}</td><td>${fdate(x.date)}</td><td>${num(x.grossCoupon, 2)}</td><td>${redeem ? num(x.principal, 2) : ''}</td><td>${taxes ? '<span class="neg">−' + num(taxes, 2) + '</span>' : '0,00'}</td><td>${num(x.amount, 2)}</td><td>${num(pv, 2)}</td></tr>`;
    });
    $('cashflows').querySelector('tbody').innerHTML = rows.join('');
    let foot = `<tr><td>Totale</td><td></td><td>${num(tot.g, 2)}</td><td>${num(tot.p, 2)}</td><td>${tot.t ? '<span class="neg">−' + num(tot.t, 2) + '</span>' : '0,00'}</td><td>${num(tot.n, 2)}</td><td>${num(tot.pv, 2)}</td></tr>`;
    if (stamp) foot += `<tr><td>Bollo stimato</td><td colspan="4"></td><td><span class="neg">−${num(-stamp, 2)}</span></td><td></td></tr>`;
    $('cashflows').querySelector('tfoot').innerHTML = foot;
    $('cf-note').textContent = 'Importi in euro su ' + eur(input.nominal).replace(',00', '') + ' di nominale';
  }

  // ------------------------------------------------------------ grafico

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function niceTicks(min, max, count) {
    const span = max - min;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const ticks = [];
    for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(+t.toFixed(10));
    return ticks;
  }

  function drawChart() {
    const host = $('chart');
    if (!last) return;
    const { result: r } = last;
    const b = r.bond;
    const f = b.freq;
    const W = Math.max(280, host.clientWidth || 600);
    const H = W < 500 ? 240 : 300;
    const m = { l: 52, r: 16, t: 16, b: 40 };

    // Asse x: rendimento effettivo annuo, ±3 punti attorno al valore attuale.
    const e0 = r.ytmEffective;
    const eMin = Math.max(e0 - 0.03, -0.05);
    const eMax = e0 + 0.03;
    const N = 120;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const e = eMin + ((eMax - eMin) * i) / N;
      const yn = B.effectiveToNominal(e, f);
      const clean = B.cleanFromYield(b, yn);
      const est = r.risk.dirty * (1 - r.risk.modified * (yn - r.ytm)) - b.accrued;
      pts.push({ e, clean, est });
    }
    let pMin = Math.min(...pts.map((p) => Math.min(p.clean, p.est)));
    let pMax = Math.max(...pts.map((p) => Math.max(p.clean, p.est)));
    const pad = (pMax - pMin) * 0.06 || 1;
    pMin -= pad; pMax += pad;

    const x = (e) => m.l + ((e - eMin) / (eMax - eMin)) * (W - m.l - m.r);
    const y = (p) => m.t + (1 - (p - pMin) / (pMax - pMin)) * (H - m.t - m.b);

    const xt = niceTicks(eMin * 100, eMax * 100, W < 500 ? 4 : 7);
    const yt = niceTicks(pMin, pMax, 5);
    const curve = pts.map((p, i) => (i ? 'L' : 'M') + x(p.e).toFixed(1) + ' ' + y(p.clean).toFixed(1)).join('');
    const area = curve + `L${x(eMax).toFixed(1)} ${y(pMin).toFixed(1)}L${x(eMin).toFixed(1)} ${y(pMin).toFixed(1)}Z`;
    const dur = pts.map((p, i) => (i ? 'L' : 'M') + x(p.e).toFixed(1) + ' ' + y(p.est).toFixed(1)).join('');

    const px = x(e0), py = y(r.clean);
    const labelRight = px < W - 150;
    host.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Curva prezzo-rendimento con stima lineare della duration">
        <g class="grid">${yt.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>
        <g class="axis">
          ${yt.map((t) => `<text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${num(t, Math.abs(yt[1] - yt[0]) < 1 ? 1 : 0)}</text>`).join('')}
          ${xt.map((t) => `<text x="${x(t / 100)}" y="${H - m.b + 18}" text-anchor="middle">${num(t, Math.abs(xt[1] - xt[0]) < 1 ? 1 : 0)}%</text>`).join('')}
        </g>
        <text class="axis-title" x="${W - m.r}" y="${H - 4}" text-anchor="end">Rendimento effettivo annuo</text>
        <path class="area" d="${area}"/>
        <path class="dur" d="${dur}"/>
        <path class="curve" d="${curve}"/>
        <circle class="point" cx="${px}" cy="${py}" r="5"/>
        <text class="point-label" x="${px + (labelRight ? 10 : -10)}" y="${py - 10}" text-anchor="${labelRight ? 'start' : 'end'}">${num(r.clean, 2)} · ${pct(e0, 2)}</text>
        <g class="hover" visibility="hidden">
          <line class="cross" y1="${m.t}" y2="${H - m.b}"/>
          <circle class="hover-dot dur-dot" r="4"/>
          <circle class="hover-dot curve-dot" r="4"/>
        </g>
        <rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent" class="hit"/>
      </svg>
      <div class="tooltip" hidden></div>`;

    const svg = host.querySelector('svg');
    const hover = svg.querySelector('.hover');
    const tip = host.querySelector('.tooltip');
    const hit = svg.querySelector('.hit');
    const move = (ev) => {
      const rect = svg.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(N, Math.round(((sx - m.l) / (W - m.l - m.r)) * N)));
      const p = pts[i];
      const cx = x(p.e);
      hover.setAttribute('visibility', 'visible');
      hover.querySelector('.cross').setAttribute('x1', cx);
      hover.querySelector('.cross').setAttribute('x2', cx);
      hover.querySelector('.curve-dot').setAttribute('cx', cx);
      hover.querySelector('.curve-dot').setAttribute('cy', y(p.clean));
      hover.querySelector('.dur-dot').setAttribute('cx', cx);
      hover.querySelector('.dur-dot').setAttribute('cy', y(p.est));
      tip.hidden = false;
      tip.innerHTML = `Rendimento <b>${pct(p.e, 2)}</b><br>Prezzo secco <b>${num(p.clean, 3)}</b><br>Stima duration ${num(p.est, 3)}`;
      const left = (cx / W) * rect.width;
      tip.style.left = Math.max(70, Math.min(rect.width - 70, left)) + 'px';
      tip.style.top = (Math.min(y(p.clean), y(p.est)) / H) * rect.height + 'px';
    };
    const leave = () => { hover.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', leave);
  }

  // ------------------------------------------------------- ricerca ISIN

  const Isin = window.Isin;
  const CONFIG = window.BOND_CONFIG || {};
  const timeIt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  const longDateIt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const longDate = (iso) => longDateIt.format(B.parseDate(iso));
  let catalogPromise = null;

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(market().catalogUrl || CONFIG.catalogUrl || 'data/titoli-stato.json', { cache: 'no-cache' })
        .then((res) => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then((data) => {
          const catalog = { map: Isin.indexCatalog(data), updated: data.aggiornato || null };
          if (catalog.updated) {
            $('isin-source').textContent = 'Elenco titoli di Stato del MEF, aggiornato al ' + longDate(catalog.updated) + '.';
            $('isin-source').hidden = false;
          }
          return catalog;
        })
        .catch((e) => {
          catalogPromise = null;
          throw e;
        });
    }
    return catalogPromise;
  }

  function setIsinStatus(text, kind) {
    $('isin-status').textContent = text;
    $('isin-status').className = 'isin-status' + (kind ? ' ' + kind : '');
  }

  function updatePriceLink(tipo) {
    const code = Isin.normalize($('isin').value);
    const valid = Isin.isValid(code);
    const m = market();
    $('isin-price').hidden = !valid || !m.priceUrl;
    if (valid && m.priceUrl) {
      $('isin-price').href = m.priceUrl(code, tipo);
      $('isin-price').firstChild.textContent = 'Vedi il prezzo su ' + m.priceSource + ' ';
    }
  }

  // ------------------------------------------------ mercati e guida ISIN

  const MARKETS = window.BOND_MARKETS || [];
  let marketId = 'it';
  const market = () => MARKETS.find((m) => m.id === marketId) || MARKETS[0] || {};

  function renderMarkets() {
    const active = MARKETS.filter((m) => m.active);
    const soon = MARKETS.filter((m) => !m.active);
    $('market-list').innerHTML =
      active.map((m) => `<button type="button" class="market-chip" role="radio" aria-checked="${m.id === marketId}" data-market="${esc(m.id)}"><span aria-hidden="true">${m.flag}</span> ${esc(m.name)}</button>`).join('') +
      (soon.length
        ? `<span class="market-soon"><span class="market-soon-label">Prossimamente</span>${soon.map((m) => `<span class="flag" title="${esc(m.name)}" aria-hidden="true">${m.flag}</span>`).join(' ')}<span class="sr-only">${soon.map((m) => esc(m.name)).join(', ')}</span></span>`
        : '');
  }

  // Guida in 4 passi: 1 ISIN, 2 Carica, 3 Verifica il prezzo, 4 Inserisci il prezzo.
  // `current` è il passo da fare; quelli prima sono completati (5 = tutti).
  let isinLoaded = false;
  function setStep(current) {
    document.querySelectorAll('#isin-steps li').forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('done', n < current);
      li.classList.toggle('current', n === current);
      if (n === current) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }
  function syncSteps() {
    if (!isinLoaded) setStep(Isin.isValid(Isin.normalize($('isin').value)) ? 2 : 1);
    else setStep($('price').value.trim() ? 5 : 3);
  }

  async function loadIsin() {
    const code = Isin.normalize($('isin').value);
    $('isin').value = code;
    isinLoaded = false;
    if (!Isin.isValid(code)) {
      $('isin').setAttribute('aria-invalid', 'true');
      setIsinStatus(code ? 'Codice ISIN non valido: servono 12 caratteri (2 lettere, 9 lettere o cifre, 1 cifra di controllo). Controlla di averlo copiato per intero.' : 'Inserisci un codice ISIN, ad esempio IT0005607970.', 'warn');
      updatePriceLink();
      syncSteps();
      return;
    }
    $('isin').setAttribute('aria-invalid', 'false');
    $('isin-load').disabled = true;
    $('isin-load').textContent = 'Caricamento…';
    $('isin-box').setAttribute('aria-busy', 'true');
    setIsinStatus('Caricamento dei dati del titolo…');
    try {
      let catalog;
      try {
        catalog = await loadCatalog();
      } catch (e) {
        updatePriceLink();
        setIsinStatus('Elenco dei titoli non disponibile in questo momento. Inserisci cedola e scadenza a mano.', 'warn');
        return;
      }
      const t = catalog.map.get(code);
      updatePriceLink(t && t.tipo);
      if (!t) {
        setIsinStatus(code.startsWith(market().isinPrefix || 'IT')
          ? 'ISIN non riconosciuto: non è fra i titoli di Stato italiani in circolazione' + (catalog.updated ? ' al ' + longDate(catalog.updated) : '') + '. Il MEF aggiorna l\'elenco una volta al mese, quindi le emissioni più recenti arrivano dopo. Per altre obbligazioni inserisci i dati a mano.'
          : 'ISIN di un altro Paese: per ora la ricerca copre solo i titoli di Stato italiani. Per questa obbligazione inserisci i dati a mano.', code.startsWith(market().isinPrefix || 'IT') ? 'warn' : 'info');
        return;
      }
      const r = Isin.toFormValues(t, $('settlement').value);
      if (r.unsupported) {
        setIsinStatus(t.descrizione + '. ' + r.unsupported, 'info');
        return;
      }
      const v = r.values;
      $('maturity').value = v.maturity;
      $('coupon').value = show(v.coupon, 4);
      $('freq').value = String(v.freq);
      $('daycount').value = v.dayCount;
      $('redemption').value = show(v.redemption, 4);
      $('tax').value = '0.125';
      $('calldate').value = '';
      $('callprice').value = '';
      $('call-details').open = false;
      $('mode-price').checked = true;
      $('price').value = '';

      let priceNote = 'Ora verifica il prezzo su ' + (market().priceSource || 'Borsa Italiana') + ' e inseriscilo come prezzo di acquisto, oppure scrivi un prezzo ipotetico. Senza prezzo il calcolo usa 100.';
      try {
        const p = await Isin.fetchPrice(code, CONFIG.priceEndpoint);
        if (p) {
          $('price').value = show(p.price, 4);
          priceNote = 'Prezzo ' + num(p.price, 2) + (p.time ? ' delle ' + timeIt.format(p.time) : '') + (p.source ? ', fonte ' + p.source : '') + '.';
        }
      } catch (e) {
        priceNote = e.message + ' Inserisci il prezzo a mano.';
      }
      isinLoaded = true;
      const when = longDate(v.maturity);
      const details = v.coupon ? `cedola ${upTo2.format(v.coupon)}% ${FREQ_LABEL[v.freq]}, scadenza ${when}` : `zero coupon, scadenza ${when}`;
      setIsinStatus(`✓ Dati del titolo caricati: ${t.descrizione} (${details}). ${priceNote}`, 'ok');
      compute();
      syncSteps();
      if (!$('price').value) $('price').focus();
    } finally {
      $('isin-load').disabled = false;
      $('isin-load').textContent = 'Carica';
      $('isin-box').removeAttribute('aria-busy');
    }
  }

  // --------------------------------------------- confronto e portafoglio

  const PF = window.Portfolio;
  const PF_KEY = 'bondcalc:portafoglio';
  const EXAMPLE = [
    // ISIN dall'elenco del MEF; prezzi ricavati da rendimenti effettivi ipotetici.
    { isin: 'IT0005584849', yieldEff: 0.026 },
    { isin: 'IT0005607970', yieldEff: 0.036 },
    { isin: 'IT0005635583', yieldEff: 0.04 },
    { isin: 'IT0005534141', yieldEff: 0.045 },
  ];
  let positions = [];
  let pfSettlementKey = '';

  function loadPositions() {
    try {
      const list = JSON.parse(localStorage.getItem(PF_KEY) || '[]');
      positions = Array.isArray(list) ? list.filter((p) => p && p.maturity && Number.isFinite(p.cleanPrice) && Number.isFinite(p.nominal)) : [];
    } catch (e) {
      positions = [];
    }
  }

  function savePositions() {
    try {
      localStorage.setItem(PF_KEY, JSON.stringify(positions));
    } catch (e) { /* archiviazione non disponibile */ }
  }

  let idCounter = 0;
  const newId = () => 'p' + (++idCounter) + '-' + positions.length + '-' + Math.floor(Math.random() * 1e6);

  function setPfStatus(text, kind) {
    $('pf-status').textContent = text;
    $('pf-status').className = 'isin-status' + (kind ? ' ' + kind : '');
  }

  function pfSettlement() {
    return B.parseDate($('settlement').value) || defaultSettlement();
  }

  function genericLabel(couponRate, maturityISO) {
    return 'Cedola ' + upTo2.format(couponRate * 100) + '% ' + maturityISO.split('-').reverse().join('/');
  }

  async function addCurrentBond() {
    if (!last || !$('error').hidden) {
      setPfStatus('Completa prima i dati del titolo nel calcolatore: ' + ($('error').hidden ? 'mancano dei dati.' : $('error').textContent), 'warn');
      return;
    }
    const { input, result } = last;
    const pos = {
      id: newId(),
      label: genericLabel(input.couponRate, B.toISO(input.maturity)),
      isin: '',
      maturity: B.toISO(input.maturity),
      couponRate: input.couponRate,
      freq: input.freq,
      dayCount: input.dayCount,
      redemption: input.redemption,
      cleanPrice: +result.clean.toFixed(4),
      nominal: input.nominal,
      taxRate: input.taxRate,
    };
    // Se il titolo viene dall'elenco del MEF ne usa la descrizione.
    const code = Isin.normalize($('isin').value);
    if (Isin.isValid(code)) {
      try {
        const t = (await loadCatalog()).map.get(code);
        if (t && t.scadenza === pos.maturity && (t.cedola == null || Math.abs(t.cedola / 100 - pos.couponRate) < 1e-9 || t.cedola === 0)) {
          pos.label = t.descrizione;
          pos.isin = code;
        }
      } catch (e) { /* senza elenco resta la descrizione generica */ }
    }
    positions.push(pos);
    savePositions();
    renderPortfolio();
    const notes = [];
    if (input.call) notes.push('la call non è considerata');
    if (input.commission > 0 || input.stampDuty) notes.push('commissioni e bollo non sono considerati');
    if (input.priceDefaulted) notes.push('prezzo non inserito: usata la pari, 100');
    setPfStatus(`${pos.label} aggiunto: ${positions.length} ${positions.length === 1 ? 'titolo' : 'titoli'} nel confronto${notes.length ? ' (' + notes.join(', ') + ')' : ''}.`, 'ok');
  }

  async function loadExample() {
    let catalog;
    try {
      catalog = await loadCatalog();
    } catch (e) {
      setPfStatus('Elenco dei titoli non disponibile: impossibile caricare l\'esempio.', 'warn');
      return;
    }
    const settlement = pfSettlement();
    const added = [];
    for (const ex of EXAMPLE) {
      const t = catalog.map.get(ex.isin);
      if (!t || positions.some((p) => p.isin === ex.isin)) continue;
      const r = Isin.toFormValues(t, B.toISO(settlement));
      if (!r.values) continue;
      const v = r.values;
      const bond = B.createBond({ settlement, maturity: B.parseDate(v.maturity), couponRate: v.coupon / 100, freq: v.freq, redemption: v.redemption, dayCount: v.dayCount });
      const clean = B.cleanFromYield(bond, B.effectiveToNominal(ex.yieldEff, v.freq));
      added.push({
        id: newId(), label: t.descrizione, isin: ex.isin, example: true,
        maturity: v.maturity, couponRate: v.coupon / 100, freq: v.freq, dayCount: v.dayCount, redemption: v.redemption,
        cleanPrice: +clean.toFixed(2), nominal: 10000, taxRate: 0.125,
      });
    }
    if (!added.length) {
      setPfStatus('I titoli dell\'esempio sono già nel confronto.', 'info');
      return;
    }
    positions = positions.concat(added);
    savePositions();
    renderPortfolio();
    setPfStatus(added.length === 1
      ? `Esempio: aggiunto ${added[0].label}, con un prezzo di esempio ricavato da un rendimento ipotetico. Sostituiscilo con il prezzo di mercato.`
      : `Esempio caricato: ${added.length} BTP veri dall'elenco del MEF, con prezzi di esempio ricavati da rendimenti ipotetici fra il 2,6% e il 4,5%. Sostituiscili con i prezzi di mercato.`, 'info');
  }

  function openPosition(pos) {
    $('isin').value = pos.isin || '';
    setIsinStatus('');
    updatePriceLink();
    $('maturity').value = pos.maturity;
    $('coupon').value = show(pos.couponRate * 100, 4);
    $('freq').value = String(pos.freq);
    $('daycount').value = pos.dayCount;
    $('redemption').value = show(pos.redemption, 4);
    $('mode-price').checked = true;
    $('price').value = show(pos.cleanPrice, 4);
    $('nominal').value = num(pos.nominal, 0);
    const taxOption = ['0.125', '0.26', '0'].find((v) => Math.abs(Number(v) - pos.taxRate) < 1e-9);
    $('tax').value = taxOption || 'custom';
    if (!taxOption) $('taxcustom').value = show(pos.taxRate * 100, 4);
    $('calldate').value = '';
    $('callprice').value = '';
    $('call-details').open = false;
    // Il confronto non considera commissioni e bollo: stesso netto della riga.
    $('commission').value = '0';
    $('stamp').checked = false;
    compute();
    setIsinStatus(pos.label + ': aperto dal confronto, senza commissioni né bollo.', 'ok');
    $('bond-form').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    $('price').focus({ preventScroll: true });
  }

  const pfMeasure = () => (document.querySelector('input[name="pf-measure"]:checked') || {}).value || 'now';
  // Nodi della curva personalizzata in punti base; null se un campo non è valido.
  function customNodes() {
    let ok = true;
    const nodes = ['pf-n2', 'pf-n10', 'pf-n30'].map((id) => {
      const raw = $(id).value.trim().replace(/\u2212/g, '-').replace(/\s*pb$/i, '');
      const v = raw === '' ? 0 : raw.includes('%') ? NaN : parseNum(raw);
      const valid = Number.isFinite(v) && Math.abs(v) <= 5000;
      $(id).setAttribute('aria-invalid', valid ? 'false' : 'true');
      if (!valid) ok = false;
      return v;
    });
    return ok ? nodes : null;
  }
  const CURVE_WARNING = 'Curva personalizzata: scrivi gli spostamenti in punti base fra −5000 e 5000, ad esempio 25 o −25.';
  const beCell = (be, useNet) => {
    if (!be) return '–';
    const v = useNet ? be.net : be.gross;
    if (v === Infinity) return 'oltre +10.000 pb';
    if (v === -Infinity) return 'nessun margine';
    return bpIt(v);
  };

  function renderPortfolio() {
    const settlement = pfSettlement();
    pfSettlementKey = B.toISO(settlement);
    const empty = positions.length === 0;
    $('pf-empty').hidden = !empty;
    $('pf-body').hidden = empty;
    $('pf-clear').hidden = empty;
    if (empty) return;

    const { rows, errors, totals } = PF.analyzePortfolio(positions, settlement);
    const anyTax = rows.some((r) => r.pos.taxRate > 0);
    $('pf-analysis').hidden = !totals;
    $('pf-none').hidden = !!totals;

    // Riquadri di sintesi
    const next12 = B.addYears(settlement, 1);
    const income12 = rows.reduce((s, r) => s + r.flows.filter((f) => f.kind === 'flusso' && f.date <= next12).reduce((a, f) => a + f.amount, 0), 0);
    // Effetto di ±100 pb dagli scenari già calcolati dal portafoglio, sul nominale inserito.
    const up = totals && PF.scenarioPnL(rows, [100, 100, 100]).total;
    const down = totals && PF.scenarioPnL(rows, [-100, -100, -100]).total;
    const money = (x) => (x < 0 ? '−' : '+') + num(Math.abs(x), 0) + ' €';
    const kpis = totals ? [
      ['Rendimento netto stimato', pct(totals.irrNet, 2), 'tasso interno dei flussi, con la tassazione di ogni titolo', 'primary'],
      ['Rendimento lordo', pct(totals.irrGross, 2), 'tasso interno dei flussi'],
      ['Controvalore totale', eur(totals.marketValue), 'tel quel, ' + num(totals.nominal, 0) + ' € nominali'],
      ['Duration modificata', num(totals.modified, 2), 'vita residua media ' + num(totals.years, 1) + ' anni'],
      ['Convessità', num(totals.convexity, 2), 'pesata per il controvalore'],
      ['DV01 totale', eur(totals.dv01), 'variazione per +1 pb di rendimento'],
      ['Se i rendimenti cambiano di 100 pb', `<span class="rate-line">+100 pb → <b class="${up.pnl < 0 ? 'neg' : ''}">circa ${money(up.pnl)}</b></span><span class="rate-line">−100 pb → <b class="${down.pnl < 0 ? 'neg' : ''}">circa ${money(down.pnl)}</b></span>`, `effetto immediato: ${signed(up.pct * 100, 1)}% / ${signed(down.pct * 100, 1)}% del controvalore`, 'rates'],
      ['Incassi netti 12 mesi', eur(income12), 'cedole e rimborsi'],
    ] : [];
    $('pf-summary-title').hidden = !totals;
    $('pf-kpis').innerHTML = kpis.map(([l, v, s, cls]) => `<div class="pf-kpi${cls ? ' ' + cls : ''}"><span class="label">${l}</span><span class="value">${v}</span><span class="sub">${s}</span></div>`).join('');

    // Tabella di confronto
    const rowHtml = rows.map((r) => {
      const p = r.pos;
      const label = esc(p.label);
      const meta = [esc(p.isin || ''), 'tassazione ' + upTo2.format(p.taxRate * 100) + '%'].filter(Boolean).join(' · ');
      return `<tr data-id="${esc(p.id)}">
        <td><span class="pf-name">${label}${p.example ? '<span class="chip">esempio</span>' : ''}</span><span class="pf-meta">${meta}</span></td>
        <td><input type="text" inputmode="decimal" aria-label="Nominale di ${label}" data-field="nominal" value="${num(p.nominal, 0)}"></td>
        <td><input type="text" inputmode="decimal" aria-label="Prezzo secco di ${label}" data-field="cleanPrice" value="${show(p.cleanPrice, 4)}"></td>
        <td>${pct(r.ytmEffective, 2)}</td>
        <td>${pct(r.netEffective, 2)}</td>
        <td>${num(r.modified, 2)}</td>
        <td>${num(r.dv01, 2)}</td>
        <td>${beCell(r.breakEven1, p.taxRate > 0)}</td>
        <td><div class="pf-row-actions"><button type="button" class="btn btn-quiet btn-small" data-action="open" aria-label="Apri ${label} nel calcolatore">Apri</button><button type="button" class="btn btn-quiet btn-small" data-action="remove" aria-label="Rimuovi ${label}">Rimuovi</button></div></td>
      </tr>`;
    });
    const errHtml = errors.map((e) => `<tr class="pf-error" data-id="${esc(e.pos.id)}"><td>${esc(e.pos.label)}</td><td colspan="7">${esc(e.message)}</td><td><div class="pf-row-actions"><button type="button" class="btn btn-quiet btn-small" data-action="remove" aria-label="Rimuovi ${esc(e.pos.label)}">Rimuovi</button></div></td></tr>`);
    // Righe nell'ordine in cui i titoli sono stati aggiunti, errori compresi.
    const htmlById = new Map();
    rows.forEach((r, i) => htmlById.set(r.pos.id, rowHtml[i]));
    errors.forEach((e, i) => htmlById.set(e.pos.id, errHtml[i]));
    $('pf-table').querySelector('tbody').innerHTML = positions.map((p) => htmlById.get(p.id) || '').join('');
    if (!totals) {
      $('pf-table').querySelector('tfoot').innerHTML = '';
      return;
    }
    $('pf-table').querySelector('tfoot').innerHTML = totals
      ? `<tr><td>Portafoglio</td><td>${num(totals.nominal, 0)}</td><td></td><td>${pct(totals.irrGross, 2)}</td><td>${pct(totals.irrNet, 2)}</td><td>${num(totals.modified, 2)}</td><td>${num(totals.dv01, 2)}</td><td>${beCell(totals.breakEven1, anyTax)}</td><td></td></tr>`
      : '';

    // Scenari
    const measure = pfMeasure();
    const custom = customNodes();
    if (!custom) setPfStatus(CURVE_WARNING, 'warn');
    else if ($('pf-status').textContent === CURVE_WARNING) setPfStatus('', '');
    const scen = PF.SCENARIOS.slice();
    if (custom && custom.some((x) => x !== 0)) scen.push({ key: 'custom', label: 'Personalizzato', nodes: custom, curve: true });
    const cols = scen.map((sc) => (measure === 'now' ? PF.scenarioPnL(rows, sc.nodes) : PF.scenarioHorizon(rows, sc.nodes, 1, settlement)));
    const valueOf = (x) => (measure === 'now' ? x.pct : anyTax ? x.net : x.gross);
    const best = cols.map((c) => {
      if (measure !== '1y' || rows.length < 2) return -1;
      let bi = -1;
      c.items.forEach((x, i) => {
        if (Number.isFinite(valueOf(x)) && (bi < 0 || valueOf(x) > valueOf(c.items[bi]))) bi = i;
      });
      return bi;
    });
    const cell = (x, isBest) => {
      const v = valueOf(x);
      const cls = v < 0 ? ' class="neg"' : '';
      const extra = measure === 'now' ? `<small>${x.pnl < 0 ? '−' : '+'}${num(Math.abs(x.pnl), 0)} €</small>` : '';
      return `<td${isBest ? ' class="best"' : ''}><span${cls}>${signed(v * 100, measure === 'now' ? 1 : 2)}%</span>${isBest ? '<span class="sr-only"> (migliore)</span>' : ''}${extra}</td>`;
    };
    const head = `<thead><tr><th scope="col">Titolo</th>${scen.map((sc) => `<th scope="col">${sc.label}</th>`).join('')}</tr></thead>`;
    const body = rows.map((r, i) => `<tr><td>${esc(r.pos.label)}</td>${cols.map((c, j) => cell(c.items[i], best[j] === i)).join('')}</tr>`).join('');
    const totalRow = `<tr class="total"><td>Portafoglio</td>${cols.map((c) => cell(c.total, false)).join('')}</tr>`;
    $('pf-scen').innerHTML = `<caption class="sr-only">Scenari dei tassi</caption>${head}<tbody>${body}${totalRow}</tbody>`;
    $('pf-scen-note').textContent = (measure === 'now'
      ? 'Variazione immediata del controvalore tel quel se oggi i rendimenti effettivi annui si spostano. '
      : `Rendimento${anyTax ? ' netto stimato' : ''} in 1 anno se oggi i rendimenti effettivi annui si spostano e restano lì: cedole incassate più prezzo di vendita fra un anno. Evidenziato il titolo migliore in ogni scenario. `) +
      'Negli scenari di curva lo spostamento è fissato a 2, 10 e 30 anni e interpolato sulla vita residua di ogni titolo: irripidimento −25, +25, +50 pb; appiattimento +25, 0, −25 pb.';

    // Incassi per anno
    // Importi arrotondati ai centesimi prima di sommarli, così righe e totali tornano.
    const cents = (x) => Math.round(x * 100) / 100;
    const cal = PF.cashflowCalendar(rows).map((e) => {
      const g = cents(e.couponsGross), n = cents(e.couponsNet), r = cents(e.redemptionsNet);
      return { year: e.year, g, n, r, hasR: e.redemptions > 0, t: cents(n + r) };
    });
    const tot = cal.reduce((s, e) => ({ g: cents(s.g + e.g), n: cents(s.n + e.n), r: cents(s.r + e.r), t: cents(s.t + e.t) }), { g: 0, n: 0, r: 0, t: 0 });
    $('pf-cal').querySelector('tbody').innerHTML = cal
      .map((e) => `<tr><td>${e.year}</td><td>${num(e.g, 2)}</td><td>${num(e.n, 2)}</td><td>${e.hasR ? num(e.r, 2) : ''}</td><td>${num(e.t, 2)}</td></tr>`)
      .join('');
    $('pf-cal').querySelector('tfoot').innerHTML = `<tr><td>Totale</td><td>${num(tot.g, 2)}</td><td>${num(tot.n, 2)}</td><td>${num(tot.r, 2)}</td><td>${num(tot.t, 2)}</td></tr>`;
  }

  // Ridisegna il portafoglio mantenendo il fuoco sul controllo equivalente.
  function renderPortfolioKeepFocus() {
    const a = document.activeElement;
    const row = a && a.closest && a.closest('#pf-table tbody tr');
    const key = row && { id: row.dataset.id, field: a.dataset.field, action: a.dataset.action };
    // Dopo un Tab il browser seleziona tutto il campo: la selezione va ripristinata,
    // altrimenti ciò che si scrive si aggiunge al valore vecchio.
    const whole = a && a.tagName === 'INPUT' && a.selectionStart === 0 && a.selectionEnd === a.value.length;
    const caret = a && a.tagName === 'INPUT' ? [a.selectionStart, a.selectionEnd] : null;
    renderPortfolio();
    if (!key) return;
    const tr = [...$('pf-table').querySelectorAll('tbody tr')].find((t) => t.dataset.id === key.id);
    const target = tr && (key.field ? tr.querySelector(`[data-field="${key.field}"]`) : tr.querySelector(`[data-action="${key.action}"]`));
    if (!target) return;
    target.focus();
    if (target.tagName === 'INPUT') {
      if (whole) target.select();
      else if (caret) target.setSelectionRange(Math.min(caret[0], target.value.length), Math.min(caret[1], target.value.length));
    }
  }

  // Ricalcolo quando cambia la data di regolamento, anche se il calcolatore è in
  // errore; con un breve ritardo, perché digitando l'anno passano date come 0002.
  let pfTimer = null;
  function onSettlementInput() {
    clearTimeout(pfTimer);
    pfTimer = setTimeout(() => {
      const d = B.parseDate($('settlement').value);
      if (!d || d.getUTCFullYear() < 1900) return;
      if (B.toISO(d) !== pfSettlementKey) renderPortfolio();
    }, 350);
  }

  function initPortfolio() {
    loadPositions();
    $('settlement').addEventListener('input', onSettlementInput);
    $('pf-add').addEventListener('click', addCurrentBond);
    $('pf-example').addEventListener('click', loadExample);
    $('pf-clear').addEventListener('click', () => {
      positions = [];
      savePositions();
      renderPortfolio();
      setPfStatus('Confronto svuotato.', 'info');
      $('pf-example').focus();
    });
    $('pf-table').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.closest('tr').dataset.id;
      const pos = positions.find((p) => p.id === id);
      if (!pos) return;
      if (btn.dataset.action === 'remove') {
        const idx = positions.indexOf(pos);
        positions = positions.filter((p) => p.id !== id);
        savePositions();
        renderPortfolio();
        setPfStatus(pos.label + ' rimosso.', 'info');
        // Il fuoco passa al titolo successivo, o al precedente, o al pulsante Aggiungi.
        const next = positions[idx] || positions[idx - 1];
        const tr = next && [...$('pf-table').querySelectorAll('tbody tr')].find((t) => t.dataset.id === next.id);
        (tr && tr.querySelector('[data-action="remove"]') || $('pf-add')).focus();
      } else {
        openPosition(pos);
      }
    });
    $('pf-table').addEventListener('change', (e) => {
      const field = e.target.dataset.field;
      if (!field) return;
      const pos = positions.find((p) => p.id === e.target.closest('tr').dataset.id);
      const v = parseNum(e.target.value, field === 'nominal');
      let problem = !pos || !(v > 0) ? (field === 'nominal' ? 'Il nominale deve essere maggiore di zero.' : 'Il prezzo deve essere maggiore di zero.') : '';
      if (!problem) {
        try {
          PF.analyzePosition({ ...pos, [field]: v }, pfSettlement());
        } catch (err) {
          problem = err.message;
        }
      }
      if (problem) {
        e.target.setAttribute('aria-invalid', 'true');
        setPfStatus(problem + ' Il valore non è stato salvato.', 'warn');
        return;
      }
      pos[field] = v;
      if (field === 'cleanPrice') pos.example = false;
      savePositions();
      setPfStatus('', '');
      // Si ridisegna dopo lo spostamento del fuoco, per non perderlo.
      setTimeout(renderPortfolioKeepFocus, 0);
    });
    document.querySelectorAll('input[name="pf-measure"]').forEach((el) => el.addEventListener('change', renderPortfolio));
    ['pf-n2', 'pf-n10', 'pf-n30'].forEach((id) => $(id).addEventListener('change', renderPortfolio));
    renderPortfolio();
  }

  // ------------------------------------------------ condivisione

  function setShareStatus(text, kind) {
    $('share-status').textContent = text;
    $('share-status').className = 'isin-status' + (kind ? ' ' + kind : '');
  }

  // Dati del calcolatore in formato tecnico, per il link condiviso.
  function shareState() {
    const code = Isin.normalize($('isin').value);
    const taxSel = $('tax').value;
    const st = {
      isin: Isin.isValid(code) ? code : '',
      settlement: $('settlement').value,
      maturity: $('maturity').value,
      coupon: parseNum($('coupon').value),
      freq: $('freq').value,
      daycount: $('daycount').value,
      redemption: parseNum($('redemption').value),
      mode: mode(),
      nominal: parseNum($('nominal').value, true),
      commission: $('commission').value.trim() === '' ? 0 : parseNum($('commission').value, true),
      tax: taxSel === 'custom' ? parseNum($('taxcustom').value) / 100 : Number(taxSel),
      stamp: $('stamp').checked,
    };
    if (st.mode === 'price') st.price = parseNum($('price').value);
    else {
      st.yield = parseNum($('yield').value);
      st.yieldbasis = $('yieldbasis').value;
    }
    if ($('calldate').value) {
      st.calldate = $('calldate').value;
      st.callprice = parseNum($('callprice').value);
    }
    return st;
  }

  // Applica al modulo i dati arrivati da un link condiviso.
  function applyShared(d) {
    if (d.isin) $('isin').value = d.isin;
    $('settlement').value = d.settlement || B.toISO(defaultSettlement());
    $('maturity').value = d.maturity;
    if (d.coupon !== undefined) $('coupon').value = show(d.coupon, 6);
    if (d.freq) $('freq').value = d.freq;
    if (d.daycount) $('daycount').value = d.daycount;
    if (d.redemption !== undefined) $('redemption').value = show(d.redemption, 6);
    $('mode-' + (d.mode === 'yield' ? 'yield' : 'price')).checked = true;
    $('price').value = d.price !== undefined ? show(d.price, 6) : '';
    if (d.yield !== undefined) $('yield').value = show(d.yield, 9);
    if (d.yieldbasis) $('yieldbasis').value = d.yieldbasis;
    if (d.nominal !== undefined) $('nominal').value = num(d.nominal, Number.isInteger(d.nominal) ? 0 : 2);
    if (d.commission !== undefined) $('commission').value = show(d.commission, 2);
    if (d.tax !== undefined) {
      const opt = ['0.125', '0.26', '0'].find((o) => Math.abs(Number(o) - d.tax) < 1e-12);
      $('tax').value = opt || 'custom';
      $('taxcustom').value = opt ? '' : show(d.tax * 100, 6);
    }
    if (d.stamp !== undefined) $('stamp').checked = d.stamp;
    $('calldate').value = d.calldate || '';
    $('callprice').value = d.calldate && d.callprice !== undefined ? show(d.callprice, 6) : '';
    $('call-details').open = !!d.calldate;
  }

  async function shareAnalysis() {
    if (!last) {
      setShareStatus('Completa prima i dati del titolo: il link condivide un\'analisi valida.', 'warn');
      return;
    }
    const url = location.href.split('#')[0].split('?')[0] + '?' + Share.encode(shareState());
    $('share-url').hidden = true;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Analisi obbligazione', url });
        setShareStatus('Analisi condivisa.', 'ok');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('Link copiato', 'ok');
    } catch (e) {
      // Appunti non disponibili: il link resta selezionato in un campo da copiare.
      $('share-url').value = url;
      $('share-url').hidden = false;
      $('share-url').select();
      setShareStatus('Copia il link qui sotto.', 'info');
    }
  }

  // ------------------------------------------------ ripristino

  function applyDefaults() {
    applyPreset('btp');
    $('nominal').value = '10.000';
    $('commission').value = '0';
    $('taxcustom').value = '';
    $('stamp').checked = false;
    $('isin').value = '';
    $('yield').value = '';
    $('yieldbasis').value = 'eff';
  }

  function resetCalculator() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* archiviazione non disponibile */ }
    applyDefaults();
    isinLoaded = false;
    setIsinStatus('');
    setShareStatus('', '');
    updatePriceLink();
    syncSteps();
    compute();
    onSettlementInput();
    $('reset-status').textContent = 'Calcolatore ripristinato ai valori iniziali. Il portafoglio non è stato modificato.';
    $('reset-status').className = 'isin-status ok';
  }

  // ------------------------------------------------------------- avvio

  function init() {
    // Un link condiviso ricostruisce l'analisi così com'era, data compresa.
    const shared = window.Share && Share.decode(location.search);
    if (shared) {
      applyDefaults();
      applyShared(shared);
      try {
        history.replaceState(null, '', location.pathname + location.hash);
      } catch (e) { /* cronologia non modificabile */ }
    } else {
      if (!restore()) applyDefaults();
      // Una data di regolamento passata viene riportata a T+2.
      const s = B.parseDate($('settlement').value);
      if (!s || s < todayUTC()) $('settlement').value = B.toISO(defaultSettlement());
    }

    renderMarkets();
    $('market-list').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-market]');
      if (!chip) return;
      marketId = chip.dataset.market;
      renderMarkets();
      updatePriceLink();
    });
    $('reset-calc').addEventListener('click', resetCalculator);
    $('share-btn').addEventListener('click', shareAnalysis);
    $('isin-price').addEventListener('click', () => {
      if (isinLoaded && !$('price').value.trim()) setStep(4);
    });
    $('price').addEventListener('input', () => {
      if (isinLoaded) syncSteps();
    });

    $('isin-load').addEventListener('click', loadIsin);
    $('isin').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadIsin();
      }
    });
    $('isin').addEventListener('input', () => {
      $('isin').setAttribute('aria-invalid', 'false');
      setIsinStatus('');
      isinLoaded = false;
      updatePriceLink();
      syncSteps();
      save();
    });
    updatePriceLink();
    loadCatalog().catch(() => { /* segnalato alla prima ricerca */ });
    initPortfolio();

    $('preset').addEventListener('change', (e) => {
      $('isin').value = '';
      setIsinStatus('');
      isinLoaded = false;
      updatePriceLink();
      syncSteps();
      applyPreset(e.target.value);
      e.target.value = '';
      compute();
      onSettlementInput();
    });
    document.querySelectorAll('input[name="mode"]').forEach((el) =>
      el.addEventListener('change', () => {
        // Porta il valore appena calcolato nel campo che diventa attivo.
        if (last) {
          const r = last.result;
          if (mode() === 'yield') {
            $('yield').value = show(($('yieldbasis').value === 'eff' ? r.ytmEffective : r.ytm) * 100, 9);
          } else {
            $('price').value = show(r.clean, 4);
          }
        }
        compute();
      })
    );
    $('yieldbasis').addEventListener('change', () => {
      if (last && mode() === 'yield') {
        const r = last.result;
        $('yield').value = show(($('yieldbasis').value === 'eff' ? r.ytmEffective : r.ytm) * 100, 9);
      }
      compute();
    });
    $('bond-form').addEventListener('input', (e) => {
      if (e.target.id === 'isin' || e.target.id === 'preset' || e.target.id === 'yieldbasis' || e.target.name === 'mode') return;
      compute();
    });
    $('bond-form').addEventListener('submit', (e) => e.preventDefault());

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        headlineVisible = entries[0].isIntersecting;
        updateDock();
      }).observe(document.querySelector('.headline'));
    }
    // Ridisegna la rosetta quando cambiano tema o palette.
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawRosette);
    } catch (e) { /* browser datati */ }
    new MutationObserver(redrawRosette).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });

    if ('ResizeObserver' in window) {
      let w = 0;
      new ResizeObserver((entries) => {
        const nw = Math.round(entries[0].contentRect.width);
        if (nw !== w) { w = nw; drawChart(); if (last) drawRosette(last.result.bond, last.input); }
      }).observe($('chart'));
    } else {
      window.addEventListener('resize', drawChart);
    }
    compute();
    syncSteps();
    if (shared) setShareStatus('Analisi aperta da un link condiviso: dati e data di regolamento sono quelli del link.', 'info');
  }

  init();
})();
