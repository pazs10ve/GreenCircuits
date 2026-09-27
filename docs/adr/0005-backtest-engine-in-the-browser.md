# 5. A TypeScript copy of the backtest engine runs the lab in demo mode

- Date: 2026-09-27
- Status: accepted

## Context

The backend is off most of the time (see [ADR 0003](0003-live-and-demo-modes.md)), so most people who open the site see it in demo mode. The lab is the heart of the project, and without the backend it could only show its builder with the Run button disabled.

Three ways to run tests without the backend were considered:

- **Saved example runs:** cheap, but nobody could test their own idea.
- **The Python engine in the browser through Pyodide:** one engine, but several megabytes to download and seconds of start-up before the first run.
- **A TypeScript copy of the engine:** instant and small, but two engines to keep in step.

## Decision

The engine is ported to TypeScript in `packages/backtest`. In demo mode the browser runs it over the same generated history the database is seeded with, and keeps runs in localStorage. The web app's hooks look the same in both modes, so the builder, the list of tests and the report don't know which engine ran.

Golden files keep the two engines in step:

1. `packages/backtest/fixtures` holds frozen daily bars and twelve strategies. Between them they cover every kind of strategy, every alternative, every exit rule, costs on and off, and an instrument that lists late.
2. The Python engine writes what it makes of them to `expected.json` (`python -m greencircuits.lab.parity --write`).
3. A pytest fails if `expected.json` no longer matches the Python engine. A vitest fails if the TypeScript engine's results differ from it by more than float rounding.

The TypeScript port copies the Python arithmetic where it matters for decisions. That includes NumPy's pairwise summation, Python's round-half-even for charges, and interest accrued by calendar days. The engine versions move together (`py-0.4` and `ts-0.4`).

## Consequences

- The lab works on any day, from a static deploy. A 49-stock rules test takes about 120 ms in the browser, including generating the history, so it runs on the main thread without a worker.
- Every engine change is made twice. CI makes that impossible to forget: change one engine and the golden-file test fails until the other matches.
- Demo runs live in one browser and aren't shared with the server.
- The report says which engine ran a test.
