import pg from "pg"
import { Kysely, PostgresDialect } from "kysely"
import type { DB } from "./schema"

// Runtime parsers that match the generated types (see .kysely-codegenrc.json):
// bigint and numeric arrive as numbers, and dates stay 'YYYY-MM-DD' strings so
// an IST trading date never shifts through a timezone conversion.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v))
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v))
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v)
// bigint[] (e.g. scr.equity_snapshot.index_ids): '{1,2,3}' → [1, 2, 3]
const INT8_ARRAY = 1016 as Parameters<typeof pg.types.setTypeParser>[0]
pg.types.setTypeParser(INT8_ARRAY, (v: string) => (v === "{}" ? [] : v.slice(1, -1).split(",").map(Number)))
// interval stays text ('00:15:00'); see typeMapping in .kysely-codegenrc.json
pg.types.setTypeParser(pg.types.builtins.INTERVAL, (v) => v)

export type { DB } from "./schema"
export type Db = Kysely<DB>

export const DEFAULT_DATABASE_URL = "postgres://greencircuits:greencircuits@localhost:55432/greencircuits"

export function createDb(url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL, max = 10): Db {
  const pool = new pg.Pool({ connectionString: url, max, application_name: process.env.SERVICE_NAME ?? "greencircuits" })
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) })
}
