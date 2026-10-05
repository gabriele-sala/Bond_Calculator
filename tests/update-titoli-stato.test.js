const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../scripts/update-titoli-stato.js');

// Estratto del CSV del MEF con le sue irregolarità reali: ISIN con spazio finale,
// cedole fra virgolette, "Cedola reale", righe senza ISIN, tabella REPO in coda.
const CSV = [
  "Ministero dell'Economia e delle Finanze;;;;;;;;",
  'Scadenze suddivise per anno;;;;;;;;',
  '(Aggiornamento al 31 agosto 2026);;;;;;;;',
  'Codice ISIN;Tipo titolo;Emissione;Scadenza;Cedola/Spread;Valuta;Circolante Euro (rivalutato);Circolante Euro (nominale);',
  'IT0005631533;BOT 12m;14/01/2025;14/01/2026;-;EUR;8.000.000.000,00;8.000.000.000,00;',
  'IT0005678492;BOT 12m;14/11/2025;13/11/2026;-;EUR;8.000.000.000,00;8.000.000.000,00;',
  'IT0005607970;BTP 10;01/08/2024;01/02/2035;3,850;EUR;21.900.000.000,00;21.900.000.000,00;',
  'IT0005542359;BTP GREEN;13/04/2023;30/10/2031;4,000;EUR;1,00;1,00;',
  'IT0005583478 ;BTP Valore;05/03/2024;05/03/2030;"3,250 ""step-up""";EUR;1,00;1,00;',
  'IT0005246134;BTP€i 10;15/11/2016;15/05/2028; 1,300  Cedola reale;EUR;1,00;1,00;',
  'IT0005451361;CCTeu 7;15/04/2021;15/04/2029;0,650;EUR;1,00;1,00;',
  'SURE;5^ tranche;02/02/2021;05/05/2028;0,000;EUR;1,00;1,00;',
  'XS3107226006 ;EMTN;02/07/2025;02/07/2035;Variabile;EUR;1,00;1,00;',
  ';;;;;Totale;3.133.379.366.070,03;3.084.137.349.644,67;',
  ';;;;;;;;',
  'Titoli di Stato per portafoglio REPO;;;;;;;;',
  'Codice ISIN;Tipo titolo;Vita residua (anni, mesi);Scadenza;Cedola ;Numero tranche;Tranche REPO (Euro);Circolante (Euro) ;',
  'IT0005210650;BTP 10;0,3;01/12/2026;1,250;16;1.000.000.000,00;19.776.843.000,00;',
].join('\r\n');

test('decodifica windows-1252 del simbolo euro', () => {
  assert.equal(U.decodeCp1252(new Uint8Array([0x42, 0x54, 0x50, 0x80, 0x69, 0x20, 0x53, 0xec])), 'BTP€i Sì');
});

test('CSV con virgolette raddoppiate', () => {
  assert.deepEqual(U.parseCsv('a;"3,250 ""step-up""";c\r\nd;;'), [['a', '3,250 "step-up"', 'c'], ['d', '', '']]);
});

test('lettura del file del MEF', () => {
  const { aggiornato, titoli, avvisi } = U.parseScadenze(CSV);
  assert.equal(aggiornato, '2026-08-31');
  assert.deepEqual(avvisi, []);
  assert.deepEqual(
    titoli.map((t) => [t.isin, t.tipo, t.cedola, t.frequenza]),
    [
      ['IT0005678492', 'BOT', 0, null],
      ['IT0005246134', 'BTP€i', 1.3, null],
      ['IT0005451361', 'CCTeu', null, null],
      ['IT0005583478', 'BTP Valore', 3.25, null],
      ['IT0005542359', 'BTP Green', 4, 2],
      ['IT0005607970', 'BTP', 3.85, 2],
    ]
  );
  const btp = titoli.find((t) => t.isin === 'IT0005607970');
  assert.equal(btp.descrizione, 'BTP 3,85% 01/02/2035');
  assert.equal(btp.emissione, '2024-08-01');
  assert.equal(btp.scadenza, '2035-02-01');
  assert.ok(!titoli.some((t) => t.isin === 'IT0005210650'), 'la tabella REPO è ignorata');
  assert.ok(!titoli.some((t) => t.isin === 'IT0005631533'), 'i titoli già scaduti sono esclusi');
});

test('tipologie del MEF', () => {
  const t = (s) => U.classify(s).tipo;
  assert.equal(t('BOT 6m'), 'BOT');
  assert.equal(t('BTP 7a'), 'BTP');
  assert.equal(t('BTP Short'), 'BTP Short Term');
  assert.equal(t('BTP GREEN 24'), 'BTP Green');
  assert.equal(t('BTPI 15'), 'BTP€i');
  assert.equal(t('BTP Italia 6'), 'BTP Italia');
  assert.equal(t('BTP Italia Sì'), 'BTP Italia Sì');
  assert.equal(t('BTP Futura 12'), 'BTP Futura');
  assert.equal(t('BTP Più'), 'BTP Più');
  assert.equal(t('GLOBAL'), null);
  assert.deepEqual(U.classify('BTP Nuovo'), { tipo: 'BTP Nuovo', known: false });
});

test('formato cambiato: errore esplicito', () => {
  assert.throws(() => U.parseScadenze('a;b;c\r\n1;2;3'), /formato del file/);
});

test('scelta del file più recente', () => {
  const html = ['31-gennaio-2026', '31-agosto-2026', '30-giugno-2026', '31-dicembre-2025']
    .map((d) => `<a href="/export/doc/Scadenze-suddivise-per-anno-aggiornamento-al-${d}.csv">csv</a>`)
    .join('');
  assert.equal(
    U.latestCsvUrl(html, 'https://www.dt.mef.gov.it/it/x/'),
    'https://www.dt.mef.gov.it/export/doc/Scadenze-suddivise-per-anno-aggiornamento-al-31-agosto-2026.csv'
  );
  assert.throws(() => U.latestCsvUrl('<a href="x.pdf">', 'https://a.b/'), /Nessun file CSV/);
});
