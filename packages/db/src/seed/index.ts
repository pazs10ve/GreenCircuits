import { createDb } from "../index"
import { seedFixedIncome } from "./fixed-income"
import { seedFundamentals } from "./fundamentals"
import { seedIpos } from "./ipos"
import { seedCandles, seedFlows, seedValuations } from "./market-data"
import { seedReference } from "./reference"
import { seedPlans, seedScreener } from "./screener"
import { timer } from "./util"

/**
 * Loads the demo universe into Postgres from the same deterministic generators
 * the web app uses, so the API serves exactly what the demo shows. Safe to
 * re-run: reference rows are upserted by fixed id and derived rows are
 * replaced, so users' watchlists, alerts and portfolios are left alone.
 *
 *   pnpm --filter @greencircuits/db seed
 */
async function main() {
  const db = createDb(undefined, 4)
  const total = timer()
  const step = async (name: string, run: () => Promise<unknown>) => {
    const t = timer()
    const result = await run()
    console.log(`  ${name.padEnd(14)} ${t().padStart(6)}  ${JSON.stringify(result)}`)
  }
  try {
    if (process.argv.includes("--new-only")) {
      // Keeps whatever the database holds, real data included; the real-data loader then fills the newcomers.
      console.log("Adding instruments the database doesn't have yet")
      await step("reference", () => seedReference(db, { newOnly: true }))
      console.log(`Done in ${total()}. Load their prices with: pnpm data:real --only membership,prices,funds,snapshot`)
      return
    }
    console.log("Seeding the demo universe")
    await step("reference", () => seedReference(db))
    await step("daily bars", () => seedCandles(db))
    await step("valuations", () => seedValuations(db))
    await step("flows", () => seedFlows(db))
    await step("fundamentals", () => seedFundamentals(db))
    await step("bonds", () => seedFixedIncome(db))
    await step("ipos", () => seedIpos(db))
    await step("screener", () => seedScreener(db))
    await step("plans", () => seedPlans(db))
    console.log(`Done in ${total()}`)
  } finally {
    await db.destroy()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
