# backtest

The lab's backtest engine in TypeScript. With the backend off, the web app runs tests with it in the browser ([ADR 0005](../../docs/adr/0005-backtest-engine-in-the-browser.md)).

It is a line-by-line port of the Python engine in `pipelines/src/greencircuits/lab`:

- the same strategies: SIPs, mixes and rules;
- the same alternatives;
- the same charges, metrics and chart samples.

`src/numeric.ts` copies the parts of NumPy's and Python's arithmetic that can change a decision.

## Golden files

`fixtures/` holds frozen daily bars (`candles.json`), twelve strategies (`cases.json`) and the Python engine's results for them (`expected.json`). `src/parity.test.ts` checks that this engine gets the same results, within float rounding.

```bash
pnpm --filter @greencircuits/backtest test                     # this engine against expected.json
pnpm --filter @greencircuits/backtest fixtures                 # regenerate candles.json and cases.json
cd pipelines && uv run python -m greencircuits.lab.parity --write   # regenerate expected.json
```

If you change either engine, the other one's test fails until the two agree again.
