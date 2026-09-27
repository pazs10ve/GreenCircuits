import { sql, type Insertable } from "kysely"
import type { Db } from "../index"
import type { DB } from "../schema"

/** Unix seconds of an IST calendar day (as the generators emit) → 'YYYY-MM-DD'. */
export function isoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

/** A Date → its IST calendar day, 'YYYY-MM-DD'. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
}

/** Indian financial year of a date: FY2026 runs April 2025 to March 2026. */
export function fiscalYearOf(date: string): number {
  const [y, m] = date.split("-").map(Number) as [number, number]
  return m >= 4 ? y + 1 : y
}

/**
 * Insert many rows in chunks that stay under Postgres's 65,535 bind-parameter
 * limit. Returns the number of rows written.
 */
export async function insertMany<T extends keyof DB & string>(
  db: Db,
  table: T,
  rows: Insertable<DB[T]>[],
): Promise<number> {
  if (rows.length === 0) return 0
  const columns = new Set(rows.flatMap((r) => Object.keys(r))).size
  const size = Math.max(1, Math.floor(60_000 / columns))
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size)
    // Kysely's generic insert typing can't follow a table name held in a type parameter.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insertInto(table).values(chunk as any).execute()
  }
  return rows.length
}

export function timer() {
  const start = performance.now()
  return () => `${((performance.now() - start) / 1000).toFixed(1)}s`
}

/**
 * Upsert rows with fixed ids into a table whose id is GENERATED ALWAYS AS
 * IDENTITY. Kysely has no OVERRIDING SYSTEM VALUE, so this one is raw SQL;
 * every value is still a bound parameter.
 */
export async function upsertFixedIds(db: Db, table: string, rows: Record<string, unknown>[]): Promise<number> {
  if (rows.length === 0) return 0
  // Rows may carry different optional columns (an index has no security_id); use them all.
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const size = Math.max(1, Math.floor(60_000 / cols.length))
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size)
    await sql`
      INSERT INTO ${sql.table(table)} (${sql.join(cols.map((c) => sql.ref(c)))})
      OVERRIDING SYSTEM VALUE
      VALUES ${sql.join(chunk.map((r) => sql`(${sql.join(cols.map((c) => r[c] ?? null))})`))}
      ON CONFLICT (id) DO UPDATE SET ${sql.join(
        cols.filter((c) => c !== "id").map((c) => sql`${sql.ref(c)} = excluded.${sql.ref(c)}`),
      )}
    `.execute(db)
  }
  return rows.length
}
