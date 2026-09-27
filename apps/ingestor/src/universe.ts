import { sql } from "kysely"
import type { Db } from "@greencircuits/db"
import type { Instrument, InstrumentKind } from "@greencircuits/market/types"

/**
 * The tradable universe from the security master: every active listing, index
 * and spot reference, with the simulator's parameters (kept in attrs), index
 * membership, and yesterday's close as the anchor for today's session.
 * Sorted by id so the simulator's opening state matches the in-browser demo
 * for the same seed.
 */
export async function loadUniverse(db: Db): Promise<Instrument[]> {
  const [rows, members, closes] = await Promise.all([
    db
      .selectFrom("ref.instrument as i")
      .leftJoin("ref.security as s", "s.id", "i.security_id")
      .select(["i.id", "i.kind", "i.segment", "i.exchange_code", "i.trading_symbol", "i.display_name", "i.tick_size", "i.lot_size", "i.quote_unit", "i.attrs", "s.shares_outstanding"])
      .where("i.status", "=", "ACTIVE")
      .where("i.kind", "in", ["LISTING", "INDEX", "SPOT"])
      .orderBy("i.id")
      .execute(),
    db.selectFrom("ref.index_constituent").select(["index_id", "member_id"]).where(sql<boolean>`upper_inf(valid_during)`).execute(),
    sql<{ instrument_id: number; close: number }>`
      SELECT DISTINCT ON (instrument_id) instrument_id, close FROM md.candle_1d
      WHERE trade_date > current_date - 14 ORDER BY instrument_id, trade_date DESC`.execute(db),
  ])
  const indicesOf = new Map<number, number[]>()
  for (const m of members) indicesOf.set(m.member_id, [...(indicesOf.get(m.member_id) ?? []), m.index_id])
  const lastClose = new Map(closes.rows.map((r) => [r.instrument_id, r.close]))

  return rows.map((r) => {
    const a = (r.attrs ?? {}) as Record<string, number | string | boolean | null>
    const kind: InstrumentKind =
      r.kind === "LISTING" ? "EQUITY" : r.kind === "INDEX" ? "INDEX" : r.segment === "CURRENCY_DERIV" ? "CURRENCY" : "COMMODITY"
    const inst: Instrument = {
      id: r.id,
      symbol: r.trading_symbol,
      name: r.display_name,
      slug: String(a.slug ?? r.trading_symbol.toLowerCase()),
      exchange: r.exchange_code as Instrument["exchange"],
      kind,
      prevClose: lastClose.get(r.id) ?? Number(a.prevClose),
      vol: Number(a.vol ?? 0.2),
      beta: Number(a.beta ?? 1),
      tick: r.tick_size,
      avgVolume: Number(a.avgVolume ?? 0),
      isFo: Boolean(a.isFo),
    }
    if (a.sector) inst.sector = a.sector as Instrument["sector"] & string
    if (a.industry) inst.industry = String(a.industry)
    if (r.shares_outstanding) inst.sharesCr = r.shares_outstanding / 1e7
    if (a.lot != null) inst.lot = Number(a.lot)
    else if (r.lot_size > 1) inst.lot = r.lot_size
    if (r.quote_unit) inst.unit = r.quote_unit
    const indices = indicesOf.get(r.id)
    if (indices) inst.indices = indices
    return inst
  })
}
