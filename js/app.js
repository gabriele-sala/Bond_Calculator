(function () {
  'use strict';

  const B = window.Bond;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'bondcalc:v1';

  // ------------------------------------------------------------ formati

  const nf = (min, max) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: min, maximumFractionDigits: max });
  const fmt = {};
  [0, 2, 3, 4, 6].forEach((d) => (fmt[d] = nf(d, d)));
  const upTo2 = nf(0, 2);
  const num = (x, d = 2) => (Number.isFinite(x) ? fmt[d].format(x) : '–');
  const pct = (x, d = 3) => (Number.isFinite(x) ? fmt[d].format(x * 100) + '%' : '–');
  const eur = (x) => (Number.isFinite(x) ? fmt[2].format(x) + ' €' : '–');
  const signed = (x, d = 2) => (x > 0 ? '+' : '') + num(x, d);
  const dateIt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fdate = (dt) => dateIt.format(dt);
  const FREQ_LABEL = { 1: 'annuale', 2: 'semestrale', 4: 'trimestrale', 12: 'mensile' };

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

  const FIELDS = ['settlement', 'maturity', 'coupon', 'freq', 'daycount', 'redemption', 'price', 'yield', 'yieldbasis', 'nominal', 'commission', 'tax', 'taxcustom', 'calldate', 'callprice'];

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

    if (m === 'price') {
      input.cleanPrice = need('price', 'Il prezzo secco deve essere maggiore di zero, ad esempio 98,50.', { gt: 0 });
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
    $('r-ytm').textContent = 'YTM ' + pct(r.ytm) + ' nominale ' + FREQ_LABEL[f];
    $('r-net').textContent = pct(inv.effective);
    $('r-net-sub').textContent = taxLabel(input);
    $('r-dirty').textContent = num(r.dirty, 4);
    $('r-dirty-sub').textContent = 'secco ' + num(r.clean, 4) + ' + rateo ' + num(r.accrued, 4);
    $('r-mod').textContent = num(r.risk.modified, 2);
    $('r-mod-sub').textContent = 'Macaulay ' + num(r.risk.macaulay, 2) + ' anni';

    const Q = input.nominal / 100;
    const facts = [
      ['Prezzo secco', num(r.clean, 4)],
      ['Rateo (' + upTo2.format(b.A) + '/' + upTo2.format(b.E) + ' gg)', num(r.accrued, 6)],
      ['Prezzo tel quel', num(r.dirty, 4)],
      ['Rendimento corrente', pct(r.currentYield)],
      ['YTM nominale (' + FREQ_LABEL[f] + ')', pct(r.ytm, 4)],
      ['Rendimento effettivo lordo', pct(r.ytmEffective, 4)],
      ['Rendimento effettivo netto', pct(inv.effective, 4)],
    ];
    if (r.callError) facts.push(['Yield to call', r.callError]);
    else if (Number.isFinite(r.ytc)) {
      facts.push(['Yield to call (effettivo)', pct(r.ytcEffective, 4)]);
      facts.push(['Yield to worst (effettivo)', pct(B.nominalToEffective(r.ytw, f), 4)]);
    }
    facts.push(
      ['Duration di Macaulay', num(r.risk.macaulay, 4) + ' anni'],
      ['Duration modificata', num(r.risk.modified, 4)],
      ['Convessità', num(r.risk.convexity, 2)],
      ['DV01 per 100', num(r.risk.dv01, 4)],
      ['DV01 sul nominale', eur(r.risk.dv01 * Q)],
      ['Vita residua', num(b.yearsToMaturity, 2) + ' anni'],
      ['Cedola precedente', fdate(b.prevCoupon)],
      ['Prossima cedola', fdate(b.nextCoupon)],
      ['Cedole residue', String(b.cashflows.length)],
      ['Controvalore tel quel', eur(Q * r.dirty)],
      ['Esborso con commissioni', eur(inv.cost)],
      ['Incassi netti totali', eur(inv.received)],
      ['Guadagno netto', eur(inv.received - inv.cost)],
    );
    $('facts').innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    renderScenarios(r);
    renderCashflows(input, r);
    drawChart();
  }

  function renderScenarios(r) {
    const b = r.bond;
    const rows = B.scenarios(b, r.ytm, [-200, -100, -50, 0, 50, 100, 200]);
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

  // ------------------------------------------------------------- avvio

  function init() {
    if (!restore()) {
      applyPreset('btp');
      $('nominal').value = '10.000';
      $('commission').value = '0';
    }
    // Una data di regolamento passata viene riportata a T+2.
    const s = B.parseDate($('settlement').value);
    if (!s || s < todayUTC()) $('settlement').value = B.toISO(defaultSettlement());

    $('preset').addEventListener('change', (e) => {
      applyPreset(e.target.value);
      e.target.value = '';
      compute();
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
      if (e.target.id === 'preset' || e.target.id === 'yieldbasis' || e.target.name === 'mode') return;
      compute();
    });
    $('bond-form').addEventListener('submit', (e) => e.preventDefault());

    if ('ResizeObserver' in window) {
      let w = 0;
      new ResizeObserver((entries) => {
        const nw = Math.round(entries[0].contentRect.width);
        if (nw !== w) { w = nw; drawChart(); }
      }).observe($('chart'));
    } else {
      window.addEventListener('resize', drawChart);
    }
    compute();
  }

  init();
})();
