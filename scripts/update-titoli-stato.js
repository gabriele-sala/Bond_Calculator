#!/usr/bin/env node
/*
 * Aggiorna data/titoli-stato.json dall'elenco "Scadenze suddivise per anno"
 * pubblicato ogni mese dal MEF - Dipartimento del Tesoro.
 *
 * Uso: node scripts/update-titoli-stato.js
 * Le funzioni di lettura sono esportate per i test.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Isin = require('../js/isin.js');

const PAGE_URL = 'https://www.dt.mef.gov.it/it/debito_pubblico/dati_statistici/scadenze_titoli_suddivise_anno/';
const OUT_FILE = path.join(__dirname, '..', 'data', 'titoli-stato.json');
const SOURCE = 'MEF - Dipartimento del Tesoro, "Scadenze suddivise per anno"';

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// ------------------------------------------------------------------ CSV

// Il MEF pubblica i CSV in windows-1252 (es. "BTP€i" con € = 0x80).
// Il TextDecoder di Node tratta windows-1252 come latin1, quindi si decodifica a mano.
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
function decodeCp1252(bytes) {
  let out = '';
  for (const b of bytes) out += b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80] : String.fromCharCode(b);
  return out;
}

// CSV con separatore ";" e virgolette doppie (raddoppiate se nel testo).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// "31/08/2026" -> "2026-08-31"
function parseDateIt(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s).trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// "31 agosto 2026" o "31-agosto-2026" -> "2026-08-31"
function parseLongDateIt(s) {
  const m = /(\d{1,2})[\s-]+([a-z]+)[\s-]+(\d{4})/i.exec(String(s));
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// "3,850" -> 3.85; " 0,550  Cedola reale" -> 0.55; "-", "Variabile", "n/d" -> null
function parseCoupon(s) {
  const m = /(\d+(?:,\d+)?)/.exec(String(s));
  return m ? Number(m[1].replace(',', '.')) : null;
}

// Tipologia del file MEF -> tipologia usata dal sito (vedi js/isin.js).
// null = emissione sui mercati esteri, esclusa dall'elenco.
function classify(raw) {
  const t = String(raw).trim();
  const rules = [
    [/^BOT\b/i, 'BOT'],
    [/^CTZ\b/i, 'CTZ'],
    [/^CCT/i, 'CCTeu'],
    [/^BTP\s*Italia\s*S[iì]/i, 'BTP Italia Sì'],
    [/^BTP\s*Italia/i, 'BTP Italia'],
    [/^BTP€?i\b/i, 'BTP€i'],
    [/^BTP\s*Futura/i, 'BTP Futura'],
    [/^BTP\s*Valore/i, 'BTP Valore'],
    [/^BTP\s*Pi[uù]/i, 'BTP Più'],
    [/^BTP\s*Green/i, 'BTP Green'],
    [/^BTP\s*Short/i, 'BTP Short Term'],
    [/^BTP(\s+\d+[a-z]?)?$/i, 'BTP'],
    [/^(EMTN|GLOBAL|EUROBOND|Ispa)\b/i, null],
  ];
  for (const [re, tipo] of rules) if (re.test(t)) return { tipo, known: true };
  return { tipo: t, known: false };
}

const FIXED_SEMIANNUAL = ['BTP', 'BTP Green', 'BTP Short Term'];

function couponIt(c) {
  return String(+c.toFixed(3)).replace('.', ',') + '%';
}

function describe(tipo, cedola, scadenza) {
  const date = scadenza.split('-').reverse().join('/');
  return cedola != null && FIXED_SEMIANNUAL.includes(tipo) ? `${tipo} ${couponIt(cedola)} ${date}` : `${tipo} ${date}`;
}

/**
 * Legge il CSV "Scadenze suddivise per anno".
 * Restituisce { aggiornato, titoli, avvisi }.
 */
function parseScadenze(text) {
  const rows = parseCsv(text);
  const avvisi = [];
  let aggiornato = null;
  let start = -1;
  for (let i = 0; i < rows.length; i++) {
    const first = (rows[i][0] || '').trim();
    if (!aggiornato && /aggiornamento al/i.test(first)) aggiornato = parseLongDateIt(first);
    if (/^codice isin$/i.test(first) && /emissione/i.test(rows[i][2] || '')) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) throw new Error('Intestazione della tabella non trovata: il formato del file è cambiato.');

  const titoli = [];
  const seen = new Set();
  for (let i = start; i < rows.length; i++) {
    const r = rows[i].map((x) => (x || '').trim());
    // La tabella finisce alla riga "Totale" (segue la tabella dei titoli REPO).
    if (!r[0] && r.some((x) => /^totale$/i.test(x))) break;
    if (!r[0]) continue;
    const isin = Isin.normalize(r[0]);
    if (!Isin.isValid(isin)) continue; // prestiti SURE, NGEU e simili
    const { tipo, known } = classify(r[1]);
    if (tipo === null) continue;
    if (!known) avvisi.push(`Tipologia sconosciuta "${r[1]}" per ${isin}`);
    const emissione = parseDateIt(r[2]);
    const scadenza = parseDateIt(r[3]);
    if (!scadenza) {
      avvisi.push(`Scadenza non leggibile per ${isin}: "${r[3]}"`);
      continue;
    }
    if (aggiornato && scadenza <= aggiornato) continue; // già scaduto
    if (seen.has(isin)) continue;
    seen.add(isin);
    let cedola = tipo === 'BOT' || tipo === 'CTZ' ? 0 : parseCoupon(r[4]);
    if (tipo === 'CCTeu') cedola = null; // nel file c'è lo spread, non la cedola
    if (FIXED_SEMIANNUAL.includes(tipo) && cedola == null) {
      avvisi.push(`Cedola non leggibile per ${isin}: "${r[4]}"`);
      continue;
    }
    titoli.push({
      isin,
      descrizione: describe(tipo, cedola, scadenza),
      tipo,
      cedola,
      frequenza: FIXED_SEMIANNUAL.includes(tipo) ? 2 : null,
      emissione,
      scadenza,
    });
  }
  titoli.sort((a, b) => (a.scadenza < b.scadenza ? -1 : a.scadenza > b.scadenza ? 1 : a.isin < b.isin ? -1 : 1));
  return { aggiornato, titoli, avvisi };
}

// Sceglie il CSV più recente fra i link della pagina del MEF.
function latestCsvUrl(html, baseUrl) {
  const links = [...html.matchAll(/href="([^"]+\.csv)"/gi)].map((m) => new URL(m[1], baseUrl).href);
  const dated = links
    .map((url) => ({ url, date: parseLongDateIt(decodeURIComponent(url.split('/').pop())) }))
    .filter((x) => x.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!dated.length) throw new Error('Nessun file CSV datato trovato nella pagina del MEF.');
  return dated[0].url;
}

// ----------------------------------------------------------------- main

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bond-calculator-updater)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function main() {
  const html = await (await get(PAGE_URL)).text();
  const csvUrl = latestCsvUrl(html, PAGE_URL);
  const buf = await (await get(csvUrl)).arrayBuffer();
  const text = decodeCp1252(new Uint8Array(buf));
  const { aggiornato, titoli, avvisi } = parseScadenze(text);

  avvisi.forEach((a) => console.warn('Avviso: ' + a));
  if (titoli.length < 100) throw new Error(`Solo ${titoli.length} titoli letti: il formato del file potrebbe essere cambiato.`);

  const out = { fonte: SOURCE, url: csvUrl, aggiornato, titoli };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1) + '\n');
  const perTipo = {};
  titoli.forEach((t) => (perTipo[t.tipo] = (perTipo[t.tipo] || 0) + 1));
  console.log(`${titoli.length} titoli, aggiornamento al ${aggiornato}:`, perTipo);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { decodeCp1252, parseCsv, parseDateIt, parseLongDateIt, parseCoupon, classify, parseScadenze, latestCsvUrl };
