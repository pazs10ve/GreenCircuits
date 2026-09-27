# market

Shared market logic in TypeScript, used by the web app, the demo-data loader and the ingestor:

- the instrument catalog;
- the market simulator (`engine.ts`), seeded by the IST date (`session.ts`);
- Indian number formatting (`en-IN`, lakh and crore);
- Black-76 pricing, implied volatility and option chains;
- the research helpers behind the site's stories and "Would it have worked?" experiments (`research/`).
