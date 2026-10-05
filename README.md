# Calcolatore Rendimento Obbligazioni

Sito statico (HTML, CSS e JavaScript, nessuna dipendenza) per calcolare con precisione il rendimento di un'obbligazione.

## Cosa calcola

- **Rendimento a scadenza (YTM)** dal prezzo, oppure **prezzo** dal rendimento
- Rendimento **effettivo annuo** (la grandezza usata da Borsa Italiana e dal MEF) e **nominale** alla frequenza della cedola
- **Rateo** e **prezzo tel quel**, con le convenzioni ACT/ACT (ICMA), 30/360 US, 30E/360, ACT/360 e ACT/365 Fixed
- **Rendimento netto** per il risparmiatore italiano: ritenuta al 12,5% o al 26%, commissioni, imposta di bollo opzionale
- **Yield to call** e **yield to worst** per i titoli richiamabili
- **Duration** di Macaulay e modificata, **convessità**, **DV01**
- Curva prezzo-rendimento, scenari di variazione dei tassi e tabella completa dei flussi di cassa

## Privacy

Il sito non contatta nessun server esterno: niente analytics, niente cookie, nessuna libreria da CDN. Anche i font (IBM Plex e Instrument Serif, licenza SIL Open Font License, testi in `fonts/`) sono ospitati nel repository, così l'indirizzo IP dei visitatori non viene inviato a Google Fonts. Tutti i calcoli avvengono nel browser.

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

Strumento a scopo informativo, non costituisce consulenza finanziaria.
