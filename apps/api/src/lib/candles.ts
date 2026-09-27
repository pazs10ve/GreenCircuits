import type { Db } from "@greencircuits/db"
import type { Candle } from "@greencircuits/market/types"
import { dateToUnix } from "./dates"

/** The last `sessions` daily bars for an instrument, oldest first, in the shape the charts and experiments use. */
export async function lastDailyCandles(db: Db, instrumentId: number, sessions: number): Promise<Candle[]> {
  const rows = await db
    .selectFrom("md.candle_1d")
    .select(["trade_date", "open", "high", "low", "close", "volume"])
    .where("instrument_id", "=", instrumentId)
    .orderBy("trade_date", "desc")
    .limit(sessions)
    .execute()
  return rows.reverse().map((r) => ({
    time: dateToUnix(r.trade_date),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }))
}
