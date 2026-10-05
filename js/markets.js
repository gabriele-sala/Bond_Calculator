/*
 * Mercati supportati dalla ricerca per ISIN.
 * Per ora è attiva solo l'Italia. Gli altri mercati sono elencati con la fonte
 * ufficiale prevista, ma senza dati né collegamenti automatici: per attivarne
 * uno servono un elenco dei titoli (come data/titoli-stato.json) e le funzioni
 * per costruire i link alle fonti.
 */
window.BOND_MARKETS = [
  {
    id: 'it',
    name: 'Italia',
    flag: '🇮🇹',
    active: true,
    isinPrefix: 'IT',
    catalogUrl: 'data/titoli-stato.json',
    catalogSource: 'MEF - Dipartimento del Tesoro',
    priceSource: 'Borsa Italiana',
    // Link alla scheda del titolo, dove verificare il prezzo.
    priceUrl: (isin, tipo) => window.Isin.borsaItalianaUrl(isin, tipo),
  },
  { id: 'fr', name: 'Francia', flag: '🇫🇷', active: false, catalogSource: 'Agence France Trésor' },
  { id: 'de', name: 'Germania', flag: '🇩🇪', active: false, catalogSource: 'Finanzagentur' },
  { id: 'es', name: 'Spagna', flag: '🇪🇸', active: false, catalogSource: 'Tesoro Público' },
  { id: 'us', name: 'USA', flag: '🇺🇸', active: false, catalogSource: 'U.S. Treasury' },
  { id: 'jp', name: 'Giappone', flag: '🇯🇵', active: false, catalogSource: 'Ministry of Finance Japan' },
];
