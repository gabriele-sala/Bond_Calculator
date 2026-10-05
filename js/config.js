// Configurazione del sito.
window.BOND_CONFIG = {
  // Elenco dei titoli di Stato per la ricerca per ISIN.
  catalogUrl: 'data/titoli-stato.json',

  // Servizio prezzi (vuoto = nessun prezzo automatico, si usa il link a Borsa Italiana).
  // Deve rispondere a GET {priceEndpoint}?isin=IT… con JSON:
  //   { "isin": "IT…", "price": 101.35, "time": "2026-10-05T14:32:00Z", "source": "Nome fonte" }
  // con prezzo secco per 100 di nominale, oppure con stato 404 se il titolo non è disponibile.
  priceEndpoint: '',
};
