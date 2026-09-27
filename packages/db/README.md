# db

This package holds three things:

- Kysely types generated from the live schema (`pnpm db:codegen`).
- The connection factory, whose Postgres type parsers match those types.
- The demo-data loader (`pnpm db:seed`).

The SQL in `db/` is the source of truth; no ORM owns the schema.

The loader fills the database for the 66-instrument demo universe:

- five years of daily bars, and ten for indices;
- valuations, financial statements and shareholding;
- bonds, IPOs and screener snapshots.

It takes about five seconds and is safe to re-run.
