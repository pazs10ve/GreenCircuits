# feed

The personalised feed on Today: a short, ranked list of what matters about the stocks a visitor follows, written as sentences.

"Follows" means their holdings, alerts, watchlists and the stocks in their tests. The feed covers:

- the day's change in their holdings;
- alerts that went off;
- moves that are unusual for the stock;
- 52-week highs and lows;
- results and dividends in the coming week;
- tests that finished;
- the biggest mover in each sector they follow;
- **signals:** the stocks that meet the entry rules of a strategy they tested, reading today's price as the close (`signals.ts`).

Ranking follows the visitor's style. Long-term investors see results, dividends and 52-week highs and lows first; traders see signals and moves first.

`buildFeed` is pure. The API builds the feed from Postgres and Valkey (`apps/api/src/modules/feed.ts`); in demo mode the browser builds it from its own storage (`apps/web/src/lib/feed/client.ts`). Both say the same things in the same words.

```bash
pnpm --filter @greencircuits/feed test
```
