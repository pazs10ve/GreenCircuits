import { COMMODITIES, CURRENCIES, EQUITIES, INDICES, LISTED_FUNDS } from "@greencircuits/market/catalog"
import { getFundamentals } from "@greencircuits/market/fundamentals"
import { dailyCandles } from "@greencircuits/market/history"
import { institutionalFlows } from "@greencircuits/market/reference"
import { mulberry32 } from "@greencircuits/market/random"
import type { Db } from "../index"
import { ISSUER_ID_OFFSET } from "./reference"
import { insertMany, isoDate, istDate } from "./util"

/** Five years of daily bars for instruments, ten for indices (the long-horizon experiments use them). */
export const HISTORY_SESSIONS = 1260
export const INDEX_HISTORY_SESSIONS = 2520

/** Instruments a batch: five hundred stocks' five years of bars are built and written a slice at a time. */
const BATCH = 25

function batches<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export async function seedCandles(db: Db): Promise<number> {
  const instruments = [...INDICES, ...EQUITIES, ...COMMODITIES, ...CURRENCIES, ...LISTED_FUNDS]
  await db.deleteFrom("md.candle_1d").where("instrument_id", "in", instruments.map((i) => i.id)).execute()
  let written = 0
  for (const batch of batches(instruments)) {
    const rows = batch.flatMap((inst) => {
      const candles = dailyCandles(inst, inst.kind === "INDEX" ? INDEX_HISTORY_SESSIONS : HISTORY_SESSIONS)
      const rng = mulberry32(inst.id * 7919)
      return candles.map((c, i) => ({
        instrument_id: inst.id,
        trade_date: isoDate(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        last_price: c.close,
        prev_close: i > 0 ? candles[i - 1]!.close : null,
        volume: c.volume,
        turnover: inst.kind === "EQUITY" ? c.volume * ((c.high + c.low + c.close) / 3) : null,
        delivery_pct: inst.kind === "EQUITY" ? Math.round((32 + rng() * 34) * 10) / 10 : null,
        source: "SIMULATED",
      }))
    })
    written += await insertMany(db, "md.candle_1d", rows)
  }
  return written
}

/**
 * Daily valuation history: market cap, trailing P/E (using the earnings known
 * on each day), P/B and dividend yield. Feeds "cheap against its own past".
 */
export async function seedValuations(db: Db): Promise<number> {
  await db.deleteFrom("corp.valuation_daily").where("security_id", "in", EQUITIES.map((e) => ISSUER_ID_OFFSET + e.id)).execute()
  let written = 0
  for (const batch of batches(EQUITIES)) {
    const rows = batch.flatMap((inst) => {
      const f = getFundamentals(inst)
      // A financial year's results (FY ends 31 March) are public by the end of May.
      const known = f.annual.map((row) => ({ from: `${2000 + Number(row.label.slice(2))}-05-31`, eps: row.eps }))
      return dailyCandles(inst, HISTORY_SESSIONS).map((c) => {
        const date = isoDate(c.time)
        const eps = known.filter((k) => k.from <= date).at(-1)?.eps
        return {
          security_id: ISSUER_ID_OFFSET + inst.id,
          trade_date: date,
          mcap_cr: c.close * (inst.sharesCr ?? 0),
          pe_ttm: eps && eps > 0 ? c.close / eps : null,
          pb: c.close / f.bookValue,
          div_yield_pct: (f.dividendYield * inst.prevClose) / c.close,
        }
      })
    })
    written += await insertMany(db, "corp.valuation_daily", rows)
  }
  return written
}

/** FPI and DII cash-market flows, ₹ crore. The sample series only has net values, so gross is derived. */
export async function seedFlows(db: Db): Promise<number> {
  const days = institutionalFlows(60)
  await db.deleteFrom("md.institutional_flow").where("trade_date", ">=", istDate(days[0]!.date)).execute()
  const rng = mulberry32(0xf10)
  const rows = days.flatMap((d) =>
    (["FPI", "DII"] as const).map((participant) => {
      const net = participant === "FPI" ? d.fpiCash : d.diiCash
      const gross = 9000 + rng() * 6000
      return {
        trade_date: istDate(d.date),
        participant,
        segment: "CASH",
        buy_value: Math.round((gross + Math.max(net, 0)) * 100) / 100,
        sell_value: Math.round((gross - Math.min(net, 0)) * 100) / 100,
        is_provisional: false,
      }
    }),
  )
  return insertMany(db, "md.institutional_flow", rows)
}
