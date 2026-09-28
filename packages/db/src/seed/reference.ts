import { sql } from "kysely"
import { COMMODITIES, CURRENCIES, EQUITIES, INDICES, LISTED_FUNDS, marketCapCr, membersOf } from "@greencircuits/market/catalog"
import { getFundamentals } from "@greencircuits/market/fundamentals"
import type { Instrument } from "@greencircuits/market/types"
import type { Db } from "../index"
import { upsertFixedIds } from "./util"

/**
 * The security master for the demo universe. Instrument ids are fixed and match
 * the simulator's catalog (indices below 100, the first 49 stocks 100–148,
 * commodities 300+, currencies 400+, the rest of the Nifty 500 10000+, ETFs
 * 20000+, REITs and InvITs 30000+), so live quotes, bars and user data all join
 * on one id. Rows are upserted, never deleted, so watchlists and alerts survive
 * a reseed.
 */

export const ISSUER_ID_OFFSET = 1000 // equity issuer and security ids: 1000 + instrument id

const PSUS = new Set(["NTPC", "ONGC", "POWERGRID", "BEL", "COALINDIA"])

/** What kind of company issued the shares, from its industry; it decides the format of its statements. */
function issuerType(e: Instrument): "BANK" | "NBFC" | "INSURER" | "PSU" | "COMPANY" {
  const industry = e.industry ?? ""
  if (/bank/i.test(industry)) return "BANK"
  if (/insurance/i.test(industry)) return "INSURER"
  if (/credit services|mortgage finance|non banking/i.test(industry)) return "NBFC"
  if (PSUS.has(e.symbol)) return "PSU"
  return "COMPANY"
}

/**
 * `newOnly` adds instruments the database doesn't have yet (and their issuers
 * and securities) and changes nothing else: a database holding real data can
 * take new listings from the catalog without going back to the demo's.
 */
export async function seedReference(db: Db, { newOnly = false } = {}): Promise<Record<string, number>> {
  const opts = { newOnly }
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
      const kind = issuerType(e)
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
    opts,
  )
  await upsertFixedIds(
    db,
    "ref.security",
    EQUITIES.map((e) => ({
      id: ISSUER_ID_OFFSET + e.id,
      issuer_id: ISSUER_ID_OFFSET + e.id,
      security_type: "EQUITY",
      isin: e.isin ?? null,
      name: `${e.name} equity shares`,
      face_value: getFundamentals(e).faceValue,
      shares_outstanding: Math.round((e.sharesCr ?? 0) * 1e7),
    })),
    opts,
  )

  // Listed funds: each ETF, REIT and InvIT is its own trust, issuing units.
  await upsertFixedIds(
    db,
    "ref.issuer",
    LISTED_FUNDS.map((f) => ({ id: ISSUER_ID_OFFSET + f.id, name: f.name, short_name: f.symbol, issuer_type: "TRUST", fs_format: "GENERAL" })),
    opts,
  )
  await upsertFixedIds(
    db,
    "ref.security",
    LISTED_FUNDS.map((f) => ({
      id: ISSUER_ID_OFFSET + f.id,
      issuer_id: ISSUER_ID_OFFSET + f.id,
      security_type: f.kind,
      isin: f.isin ?? null,
      name: `${f.name} units`,
    })),
    opts,
  )

  // Instruments.
  const rank = new Map([...EQUITIES].sort((a, b) => marketCapCr(b, b.prevClose) - marketCapCr(a, a.prevClose)).map((e, i) => [e.id, 1000 - i]))
  const common = (i: Instrument) => ({
    id: i.id,
    display_name: i.name,
    tick_size: i.tick,
    status: "ACTIVE" as const,
    // Simulator parameters and page slugs; the ingestor and the web read these.
    attrs: JSON.stringify({
      slug: i.slug,
      vol: i.vol,
      beta: i.beta,
      avgVolume: i.avgVolume,
      prevClose: i.prevClose,
      isFo: i.isFo ?? false,
      lot: i.lot ?? null,
      sector: i.sector ?? null,
      industry: i.industry ?? null,
      ...(i.category && { category: i.category }),
      ...(i.underlying && { underlying: i.underlying }),
      ...(i.tracks != null && { tracks: i.tracks }),
    }),
  })
  // Funds rank below every stock in search, the most traded first.
  const fundRank = new Map([...LISTED_FUNDS].sort((a, b) => b.prevClose * b.avgVolume - a.prevClose * a.avgVolume).map((f, i) => [f.id, 450 - i]))
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
    ...LISTED_FUNDS.map((f) => ({
      ...common(f),
      kind: "LISTING",
      exchange_code: "NSE",
      segment: "CASH",
      trading_symbol: f.symbol,
      // NSE's series: EQ for ETFs, RR for REITs, IV for InvITs.
      series: f.kind === "REIT" ? "RR" : f.kind === "INVIT" ? "IV" : "EQ",
      security_id: ISSUER_ID_OFFSET + f.id,
      search_rank: fundRank.get(f.id)!,
      lot_size: 1,
    })),
  ], opts)

  // Index membership, weighted by market cap at yesterday's close; real data keeps its own.
  if (newOnly) {
    const known = await db.selectFrom("ref.instrument").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow()
    return { instruments: Number(known.n) }
  }
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
    issuers: EQUITIES.length + LISTED_FUNDS.length,
    instruments: INDICES.length + EQUITIES.length + COMMODITIES.length + CURRENCIES.length + LISTED_FUNDS.length,
    constituents: constituents.length,
  }
}
