import { sql } from "kysely"
import { COMMODITIES, CURRENCIES, EQUITIES, INDICES, marketCapCr, membersOf } from "@greencircuits/market/catalog"
import { getFundamentals } from "@greencircuits/market/fundamentals"
import type { Instrument } from "@greencircuits/market/types"
import type { Db } from "../index"
import { upsertFixedIds } from "./util"

/**
 * The security master for the demo universe. Instrument ids are fixed and match
 * the simulator's catalog (indices 1–7, equities 100+, commodities 300+,
 * currencies 400+), so live quotes, bars and user data all join on one id.
 * Rows are upserted, never deleted, so watchlists and alerts survive a reseed.
 */

export const ISSUER_ID_OFFSET = 1000 // equity issuer and security ids: 1000 + instrument id

const BANKS = new Set(["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK"])
const NBFCS = new Set(["BAJFINANCE", "SHRIRAMFIN", "JIOFIN", "BAJAJFINSV"])
const INSURERS = new Set(["SBILIFE", "HDFCLIFE"])
const PSUS = new Set(["NTPC", "ONGC", "POWERGRID", "BEL", "COALINDIA"])

export async function seedReference(db: Db): Promise<Record<string, number>> {
  // Industries: our sectors at level 1, industries under them at level 2.
  const sectors = [...new Set(EQUITIES.map((e) => e.sector!))]
  await db
    .insertInto("ref.industry")
    .values(sectors.map((name) => ({ scheme: "NSE", level: 1, name, parent_id: null })))
    .onConflict((oc) => oc.doNothing())
    .execute()
  const level1 = await db.selectFrom("ref.industry").select(["id", "name"]).where("level", "=", 1).execute()
  const sectorId = new Map(level1.map((r) => [r.name, r.id]))
  const industryRows = [...new Map(EQUITIES.map((e) => [`${e.sector}|${e.industry}`, e])).values()]
  await db
    .insertInto("ref.industry")
    .values(industryRows.map((e) => ({ scheme: "NSE", level: 2, name: e.industry!, parent_id: sectorId.get(e.sector!)! })))
    .onConflict((oc) => oc.doNothing())
    .execute()
  const level2 = await db.selectFrom("ref.industry").select(["id", "name", "parent_id"]).where("level", "=", 2).execute()
  const industryId = (e: Instrument) => level2.find((r) => r.name === e.industry && r.parent_id === sectorId.get(e.sector!))?.id ?? null

  // Issuers and equity securities.
  await upsertFixedIds(
    db,
    "ref.issuer",
    EQUITIES.map((e) => {
      const kind = BANKS.has(e.symbol) ? "BANK" : NBFCS.has(e.symbol) ? "NBFC" : INSURERS.has(e.symbol) ? "INSURER" : PSUS.has(e.symbol) ? "PSU" : "COMPANY"
      return {
        id: ISSUER_ID_OFFSET + e.id,
        name: e.name,
        short_name: e.symbol,
        issuer_type: kind,
        industry_id: industryId(e),
        fs_format: kind === "BANK" ? "BANK" : kind === "NBFC" ? "NBFC" : kind === "INSURER" ? "INSURANCE" : "GENERAL",
        description: getFundamentals(e).about,
      }
    }),
  )
  await upsertFixedIds(
    db,
    "ref.security",
    EQUITIES.map((e) => ({
      id: ISSUER_ID_OFFSET + e.id,
      issuer_id: ISSUER_ID_OFFSET + e.id,
      security_type: "EQUITY",
      isin: null,
      name: `${e.name} equity shares`,
      face_value: getFundamentals(e).faceValue,
      shares_outstanding: Math.round((e.sharesCr ?? 0) * 1e7),
    })),
  )

  // Instruments.
  const rank = new Map([...EQUITIES].sort((a, b) => marketCapCr(b, b.prevClose) - marketCapCr(a, a.prevClose)).map((e, i) => [e.id, 1000 - i]))
  const common = (i: Instrument) => ({
    id: i.id,
    display_name: i.name,
    tick_size: i.tick,
    status: "ACTIVE" as const,
    // Simulator parameters and page slugs; the ingestor and the web read these.
    attrs: JSON.stringify({ slug: i.slug, vol: i.vol, beta: i.beta, avgVolume: i.avgVolume, prevClose: i.prevClose, isFo: i.isFo ?? false, lot: i.lot ?? null, sector: i.sector ?? null, industry: i.industry ?? null }),
  })
  await upsertFixedIds(db, "ref.instrument", [
    ...INDICES.map((i) => ({
      ...common(i),
      kind: "INDEX",
      exchange_code: i.exchange,
      segment: "INDEX",
      trading_symbol: i.symbol,
      search_rank: 2000 - i.id,
      lot_size: 1,
    })),
    ...EQUITIES.map((e) => ({
      ...common(e),
      kind: "LISTING",
      exchange_code: "NSE",
      segment: "CASH",
      trading_symbol: e.symbol,
      series: "EQ",
      security_id: ISSUER_ID_OFFSET + e.id,
      search_rank: rank.get(e.id)!,
      lot_size: 1,
    })),
    ...COMMODITIES.map((c) => ({
      ...common(c),
      kind: "SPOT",
      exchange_code: "MCX",
      segment: "COMMODITY_DERIV",
      trading_symbol: c.symbol,
      product: c.symbol,
      quote_unit: c.unit ?? null,
      lot_size: c.lot ?? 1,
      search_rank: 500,
    })),
    ...CURRENCIES.map((c) => ({
      ...common(c),
      kind: "SPOT",
      exchange_code: "NSE",
      segment: "CURRENCY_DERIV",
      trading_symbol: c.symbol,
      product: c.symbol,
      lot_size: c.lot ?? 1,
      search_rank: 400,
    })),
  ])

  // Index membership, weighted by market cap at yesterday's close.
  const indexIds = INDICES.map((i) => i.id)
  await db.deleteFrom("ref.index_constituent").where("index_id", "in", indexIds).execute()
  const constituents = INDICES.flatMap((index) => {
    const members = membersOf(index.id)
    const total = members.reduce((s, m) => s + marketCapCr(m, m.prevClose), 0)
    return members.map((m) => ({
      index_id: index.id,
      member_id: m.id,
      valid_during: "[2021-01-01,)",
      weight_pct: Math.round((marketCapCr(m, m.prevClose) / total) * 1e6) / 1e4,
    }))
  })
  if (constituents.length) await db.insertInto("ref.index_constituent").values(constituents).execute()

  // Keep identity sequences clear of the fixed ids above.
  for (const table of ["ref.issuer", "ref.security", "ref.instrument"]) {
    await sql`SELECT setval(pg_get_serial_sequence(${table}, 'id'), GREATEST((SELECT max(id) FROM ${sql.table(table)}), 1000000))`.execute(db)
  }

  return {
    industries: level1.length + level2.length,
    issuers: EQUITIES.length,
    instruments: INDICES.length + EQUITIES.length + COMMODITIES.length + CURRENCIES.length,
    constituents: constituents.length,
  }
}
