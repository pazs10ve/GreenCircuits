import { sql } from "kysely"
import type { Dataset } from "@greencircuits/contracts"
import type { Db } from "@greencircuits/db"

let memo: { value: Dataset; at: number } | undefined

/**
 * "real" once the real-data loader has filled the database (it marks every
 * instrument it loads), "sample" for the seeded demo data. Checked at most
 * once a minute.
 */
export async function datasetOf(db: Db): Promise<Dataset> {
  if (memo && Date.now() - memo.at < 60_000) return memo.value
  const { rows } = await sql<{ real: boolean }>`
    SELECT EXISTS (SELECT 1 FROM ref.instrument WHERE attrs->>'dataSource' = 'REAL') AS real`.execute(db)
  memo = { value: rows[0]?.real ? "real" : "sample", at: Date.now() }
  return memo.value
}
