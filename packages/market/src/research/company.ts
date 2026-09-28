import { EQUITIES } from "../catalog"
import { getFundamentals, screenerSnapshot, type Fundamentals } from "../fundamentals"
import { dailyCandles } from "../history"
import type { Instrument, Sector } from "../types"
import { formatNumber } from "../format"
import { median, percentileOf } from "./metrics"

/**
 * A company in five numbers: valuation against its own history, growth,
 * profitability against its sector, the balance sheet, and who owns it.
 * Each comes with a plain verdict, computed from the figures.
 */

export type Tone = "good" | "neutral" | "caution"

export interface PeHistory {
  current: number
  min: number
  max: number
  median: number
  percentile: number
  years: number
}

/** Summarise a P/E series (one value per session, oldest first) against the current P/E. */
export function peHistoryFrom(values: number[], current: number, years: number): PeHistory | null {
  if (values.length < 120 || current <= 0) return null
  return {
    current,
    min: Math.min(...values, current),
    max: Math.max(...values, current),
    median: median(values),
    percentile: percentileOf(values, current),
    years: Math.max(1, Math.round(years)),
  }
}

/** P/E on each day of the last five years, using the earnings known on that day (demo generators). */
export function peHistory(inst: Instrument, f: Fundamentals): PeHistory | null {
  if (f.epsTtm <= 0) return null
  const candles = dailyCandles(inst, 252 * 5)
  // A financial year's results (FY ends 31 March) are public by the end of May.
  const known = f.annual.map((row) => ({ from: Date.UTC(2000 + Number(row.label.slice(2)), 4, 31) / 1000, eps: row.eps }))
  const values: number[] = []
  let first = 0
  for (const c of candles) {
    const eps = known.filter((k) => k.from <= c.time).at(-1)?.eps
    if (!eps || eps <= 0) continue
    if (!first) first = c.time
    values.push(c.close / eps)
  }
  if (!first) return null
  return peHistoryFrom(values, f.pe, (candles.at(-1)!.time - first) / (365.25 * 86400))
}

export interface SectorMedians {
  pe: number
  pb: number
  roe: number
  debtEquity: number | null
}

/** Medians of a sector's rows (from the screener snapshot, wherever it comes from). */
export function sectorMediansFrom(rows: { pe: number | null; pb: number | null; roe: number | null; debtEquity: number | null }[]): SectorMedians {
  const pick = (k: "pe" | "pb" | "roe") => rows.map((r) => r[k]).filter((v): v is number => v != null)
  const de = rows.map((r) => r.debtEquity).filter((v): v is number => v != null)
  return { pe: median(pick("pe")), pb: median(pick("pb")), roe: median(pick("roe")), debtEquity: de.length ? median(de) : null }
}

const sectorCache = new Map<Sector, SectorMedians>()

/** Sector medians from the demo generators. */
export function sectorMedians(sector: Sector): SectorMedians {
  const hit = sectorCache.get(sector)
  if (hit) return hit
  const m = sectorMediansFrom(screenerSnapshot().filter((r) => r.sector === sector))
  sectorCache.set(sector, m)
  return m
}

export interface Pillar {
  id: "valuation" | "growth" | "profitability" | "balance" | "ownership"
  label: string
  figure: string
  unit: string
  verdict: string
  tone: Tone
  detail: string
}

export interface CompanyProfile {
  f: Fundamentals
  pe: PeHistory | null
  sector: SectorMedians
  pillars: Pillar[]
}

/** The company profile from the demo generators. */
export function companyProfile(inst: Instrument): CompanyProfile {
  const f = getFundamentals(inst)
  return buildProfile(inst, f, peHistory(inst, f), sectorMedians(inst.sector!))
}

/** The five pillars from fundamentals, valuation history and sector medians, wherever they came from. */
export function buildProfile(inst: Pick<Instrument, "sector">, f: Fundamentals, pe: PeHistory | null, sector: SectorMedians): CompanyProfile {
  const pillars: Pillar[] = []
  const lender = inst.sector === "Financials"

  // Valuation: against its own past, which says more than against other companies.
  if (pe) {
    const p = pe.percentile
    pillars.push({
      id: "valuation",
      label: "Valuation",
      figure: formatNumber(pe.current, 1),
      unit: "× earnings",
      verdict: p <= 30 ? "Cheaper than usual" : p >= 70 ? "Pricier than usual" : "About its usual price",
      tone: p <= 30 ? "good" : p >= 70 ? "caution" : "neutral",
      // At the extremes a rounded share would claim "100% of days", which is never quite true.
      detail:
        p >= 99.5
          ? `Near its highest in ${pe.years} years`
          : p <= 0.5
            ? `Near its lowest in ${pe.years} years`
            : p >= 50
              ? `Higher than on ${formatNumber(p, 0)}% of days in the last ${pe.years} years`
              : `Lower than on ${formatNumber(100 - p, 0)}% of days in the last ${pe.years} years`,
    })
  }

  const g = f.profitCagr3y
  pillars.push({
    id: "growth",
    label: "Growth",
    figure: `${g >= 0 ? "+" : "−"}${formatNumber(Math.abs(g), 0)}%`,
    unit: "profit a year",
    verdict: g >= 15 ? "Growing fast" : g >= 8 ? "Growing steadily" : g >= 0 ? "Growing slowly" : "Profits shrinking",
    tone: g >= 8 ? "good" : g >= 0 ? "neutral" : "caution",
    detail: `Over three years; sales grew ${formatNumber(f.salesCagr3y, 0)}% a year`,
  })

  const gap = f.roe - sector.roe
  pillars.push({
    id: "profitability",
    label: "Profitability",
    figure: `${formatNumber(f.roe, 0)}%`,
    unit: "return on equity",
    verdict: gap >= 3 ? "Better than its sector" : gap <= -3 ? "Below its sector" : "In line with its sector",
    tone: gap >= 3 ? "good" : gap <= -3 ? "caution" : "neutral",
    detail: `Sector median ${formatNumber(sector.roe, 0)}%`,
  })

  if (lender || f.debtEquity == null) {
    const rel = f.pb / sector.pb
    pillars.push({
      id: "balance",
      label: "Book value",
      figure: formatNumber(f.pb, 1),
      unit: "× book",
      verdict: rel <= 0.85 ? "Below its sector" : rel >= 1.15 ? "Above its sector" : "In line with its sector",
      tone: "neutral",
      detail: `Lenders borrow by design, so price to book matters more than debt. Sector median ${formatNumber(sector.pb, 1)}×`,
    })
  } else {
    const de = f.debtEquity
    pillars.push({
      id: "balance",
      label: "Debt",
      figure: formatNumber(de, 2),
      unit: "debt to equity",
      verdict: de < 0.3 ? "Little debt" : de <= 1 ? "Manageable debt" : "Heavily borrowed",
      tone: de < 0.3 ? "good" : de <= 1 ? "neutral" : "caution",
      detail: `₹${formatNumber(de * 100, 0)} of borrowing for every ₹100 of shareholders' money`,
    })
  }

  const sh = f.shareholding
  const now = sh.at(-1)!
  const yearAgo = sh.at(-5) ?? sh[0]!
  const fpiMove = now.fpi - yearAgo.fpi
  const promoterMove = now.promoter - yearAgo.promoter
  // NSE's summary pattern gives only promoters and the public; foreign and fund holdings are then unknown, not zero.
  const split = sh.some((s) => s.fpi > 0 || s.dii > 0)
  const moved = (whose: string, d: number) =>
    Math.abs(d) < 0.05 ? `${whose} stake unchanged in a year` : `${whose} stake ${d > 0 ? "up" : "down"} ${formatNumber(Math.abs(d), 1)} points in a year`
  let verdict: string
  let tone: Tone = "neutral"
  if (now.promoter === 0) verdict = "Widely held, no promoter"
  else if (now.pledged > 1) {
    verdict = `${formatNumber(now.pledged, 1)}% of shares pledged`
    tone = "caution"
  } else if (promoterMove < -1) {
    verdict = "Promoters have been selling"
    tone = "caution"
  } else if (split && fpiMove > 1) {
    verdict = "Foreign investors buying"
    tone = "good"
  } else if (split && fpiMove < -1) verdict = "Foreign investors trimming"
  else verdict = "Steady ownership"
  pillars.push({
    id: "ownership",
    label: "Ownership",
    figure: now.promoter > 0 ? `${formatNumber(now.promoter, 1)}%` : split ? `${formatNumber(now.fpi, 0)}%` : "100%",
    unit: now.promoter > 0 ? "held by promoters" : split ? "held by foreign investors" : "held by the public",
    verdict,
    tone,
    detail: split ? moved("Foreign investors'", fpiMove) : now.promoter > 0 ? moved("Promoters'", promoterMove) : "Owned by funds, foreign investors and the public",
  })

  return { f, pe, sector, pillars }
}

/** The lede for a company page, from the current price, the 52-week high, valuation history and growth. */
export function companyLede(
  inst: Pick<Instrument, "name">,
  price: number,
  high52: number,
  profile: { pe: PeHistory | null; f: Pick<Fundamentals, "profitCagr3y"> },
): string {
  const short = inst.name
  const fromHigh = (price / high52 - 1) * 100
  const where =
    fromHigh > -1
      ? `${short} is trading at a 52-week high`
      : `${short} is ${formatNumber(Math.abs(fromHigh), 0)}% below its 52-week high`
  const pe = profile.pe
  const valuation = pe
    ? `, at ${formatNumber(pe.current, 0)} times earnings: ${
        pe.percentile <= 30 ? "cheaper than it has usually been" : pe.percentile >= 70 ? "more than it has usually cost" : "close to its usual valuation"
      } over the last ${pe.years} years`
    : ""
  const g = profile.f.profitCagr3y
  const growth =
    g >= 0
      ? `Profit has grown ${formatNumber(g, 0)}% a year for three years`
      : `Profit has shrunk ${formatNumber(Math.abs(g), 0)}% a year for three years`
  return `${where}${valuation}. ${growth}.`
}

/** Peers ranked by market cap, for the comparison table. */
export function peerRows(inst: Instrument) {
  return EQUITIES.filter((e) => e.sector === inst.sector)
    .map((e) => ({ inst: e, f: getFundamentals(e) }))
    .sort((a, b) => b.inst.prevClose * (b.inst.sharesCr ?? 0) - a.inst.prevClose * (a.inst.sharesCr ?? 0))
    .slice(0, 6)
}
