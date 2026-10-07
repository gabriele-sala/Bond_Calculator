# Calcolatore Rendimento Obbligazioni

Sito statico (HTML, CSS e JavaScript, nessuna dipendenza) per calcolare con precisione il rendimento di un'obbligazione: **[calcoloobbligazioni.it](https://calcoloobbligazioni.it)**.

## Cosa calcola

- **Rendimento a scadenza (YTM)** dal prezzo, oppure **prezzo** dal rendimento
- Rendimento **effettivo annuo** (la grandezza usata da Borsa Italiana e dal MEF) e **nominale** alla frequenza della cedola
- **Rateo** e **prezzo tel quel**, con le convenzioni ACT/ACT (ICMA), 30/360 US, 30E/360, ACT/360 e ACT/365 Fixed
- **Rendimento netto** per il risparmiatore italiano: ritenuta al 12,5% o al 26%, commissioni, imposta di bollo opzionale
- **Yield to call** e **yield to worst** per i titoli richiamabili
- **Duration** di Macaulay e modificata, **convessità**, **DV01**
- Curva prezzo-rendimento, scenari di variazione dei tassi e tabella completa dei flussi di cassa
- **Rialzo di pareggio** a 1 e 3 anni (quanto può salire il rendimento perché cedole e prezzo di vendita restituiscano quanto speso) e **tempo di recupero** dopo un rialzo improvviso, lordi e netti
- **Confronto e portafoglio**: più titoli insieme con rendimento interno dei flussi complessivi, duration e convessità pesate, DV01 totale, pareggio, incassi netti per anno e scenari paralleli o di curva (irripidimento, appiattimento, curva personalizzata), come effetto immediato o rendimento a 1 anno

Gli spostamenti in punti base si riferiscono sempre al rendimento effettivo annuo, la stessa grandezza mostrata in testata.

## Aspetto

In alto a destra si sceglie il **tema** (automatico, chiaro o scuro) e il **colore** fra quattro palette: Verde, Blu, Ambra e Grafite. La scelta resta salvata nel browser. Ogni palette ha i suoi colori per il tema chiaro e per quello scuro, con contrasti del testo conformi a WCAG AA e colori del grafico distinguibili anche da chi ha difficoltà con i colori.

## Ricerca per ISIN

In cima al modulo si può cercare un titolo di Stato italiano per ISIN, seguendo una guida in quattro passi: inserisci l'ISIN, Carica, verifica il prezzo, inserisci il prezzo di acquisto. Cedola, frequenza, scadenza e tassazione si compilano da soli e restano modificabili. Il link "Vedi il prezzo su Borsa Italiana" apre la scheda del titolo, da cui copiare il prezzo: il sito non scarica prezzi in automatico.

Il mercato attivo è l'Italia. Francia, Germania, Spagna, USA e Giappone sono indicati come "prossimamente", con la rispettiva fonte ufficiale (`js/markets.js`), ma senza dati né collegamenti.

- Codice ISIN verificato con la cifra di controllo (ISO 6166).
- Gestiti: BTP, BTP Green, BTP Short Term, BOT e CTZ. CCTeu, BTP Italia, BTP€i, BTP Valore, BTP Più e BTP Futura vengono riconosciuti ma non calcolati (cedola variabile, indicizzata o crescente).
- L'elenco (`data/titoli-stato.json`) viene dal file mensile "Scadenze suddivise per anno" del [MEF - Dipartimento del Tesoro](https://www.dt.mef.gov.it/it/debito_pubblico/dati_statistici/scadenze_titoli_suddivise_anno/). Il workflow `update-data.yml` lo controlla ogni lunedì e, se è cambiato, salva il nuovo elenco e ripubblica il sito. Per aggiornarlo a mano: `node scripts/update-titoli-stato.js`.
- Le note legali del sito del Tesoro consentono il riuso non commerciale citando la fonte; per un uso a fini di lucro serve il loro permesso scritto.

### Collegare un servizio prezzi

Il sito è pronto per ricevere i prezzi in automatico. Basta impostare `priceEndpoint` in `js/config.js` con l'indirizzo di un servizio che risponda a `GET {priceEndpoint}?isin=IT…` con:

```json
{ "isin": "IT0005…", "price": 101.35, "time": "2026-10-05T14:32:00Z", "source": "Nome fonte" }
```

dove `price` è il prezzo secco per 100 di nominale, oppure con stato 404 se il titolo non è disponibile. Se il servizio non risponde, il sito chiede il prezzo a mano.

## Prezzo di acquisto

Nel campo "Prezzo di acquisto / simulazione" va il prezzo secco per 100 di nominale: quello di mercato attuale oppure un prezzo ipotetico, per simulare un acquisto. Se il campo è vuoto il calcolo usa 100, cioè la pari, e lo dice sotto il campo.

## Condividere un'analisi

"Condividi analisi" crea un link con i dati del titolo e della simulazione nell'indirizzo (ISIN, date, cedola, frequenza, convenzione, rimborso, prezzo o rendimento, nominale, commissioni, aliquota, bollo, call). Dove il browser lo permette, di solito sul telefono, si apre la condivisione del sistema; altrimenti il link viene copiato. Chi apre il link vede la stessa analisi, con la stessa data di regolamento.

- Nel link non ci sono dati personali né il portafoglio.
- Un link aperto non sostituisce l'analisi salvata da chi lo riceve finché non modifica qualcosa; il pulsante "Torna alla tua analisi" la riporta.
- Se il link è incompleto o modificato a mano, il sito dice quali dati non ha potuto leggere.

"Ripristina calcolatore" riporta il modulo ai valori iniziali senza toccare il portafoglio; "Svuota portafoglio" fa l'opposto.

## Privacy

Nessun cookie e nessuna libreria da CDN. L'unico servizio esterno sono le statistiche di visita anonime di [GoatCounter](https://www.goatcounter.com), senza cookie: si contano la visita e alcune azioni (titolo caricato da ISIN, PDF, link condiviso), mai i dati dell'analisi, che vengono tolti dall'indirizzo prima del conteggio. Se un blocco pubblicità ferma GoatCounter, il sito funziona lo stesso. L'ultima analisi, il portafoglio e la scelta del tema restano salvati solo nel browser (`localStorage`).

I link condivisi e il PDF usano sempre l'indirizzo pubblico del sito (`siteUrl` in `js/config.js`), anche se la pagina è aperta dall'indirizzo tecnico di GitHub Pages. Nel PDF i margini di pagina sono a zero, così il browser non aggiunge indirizzo e data ai bordi. Anche i font (IBM Plex e Instrument Serif, licenza SIL Open Font License, testi in `fonts/`) sono ospitati nel repository, così l'indirizzo IP dei visitatori non viene inviato a Google Fonts. Tutti i calcoli avvengono nel browser.

## Precisione

Il motore di calcolo (`js/bond.js`) segue la convenzione ICMA, con gli stessi esponenti `DSC/E + k − 1` delle funzioni Excel. I test confrontano i risultati con gli esempi ufficiali Microsoft di `PRICE`, `YIELD`, `DURATION` e `MDURATION`, oltre a verificare rateo, calendario cedolare con regola di fine mese, inversione prezzo/rendimento, convessità e tassazione.

```bash
npm test
```

## Uso in locale

Apri `index.html` nel browser, oppure:

```bash
npm start   # http://localhost:8000
```

## Pubblicazione

Il workflow `.github/workflows/pages.yml` esegue i test e pubblica il sito su GitHub Pages a ogni push su `main`. Per attivarlo: *Settings → Pages → Build and deployment → Source: GitHub Actions*.

## Limiti

- Si assume un calendario cedolare regolare (niente primo o ultimo periodo irregolare).
- Il rendimento netto è una stima per il regime amministrato e non considera il disaggio di emissione né la compensazione delle minusvalenze.
- La yield to call assume che la data di call coincida con una data di stacco cedola.
- Pareggio, tempo di recupero e scenari a 1 anno non reinvestono le cedole e non considerano lo scorrimento sulla curva (ogni titolo mantiene il proprio rendimento più lo spostamento). Il confronto non include commissioni, bollo e yield to call.

Strumento a scopo informativo, non costituisce consulenza finanziaria.
