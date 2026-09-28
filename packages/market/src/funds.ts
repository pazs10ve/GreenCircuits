import data from "./data/mutual-funds.json"
import { COMMODITIES, INDEX, getInstrument } from "./catalog"
import { dailyCandles } from "./history"
import { gaussian, hashString, mulberry32 } from "./random"
import { istDate } from "./session"
import type { Point } from "./types"

/**
 * Mutual funds. The site's categories fold SEBI's, as AMFI spells them, into
 * one list per asset class. In the demo, a sample of real schemes (their names,
 * categories and latest NAVs from data/mutual-funds.json) gets a NAV history
 * simulated from the demo market's own indices, so a large-cap fund moves with
 * the Nifty 50 and a liquid fund creeps up.
 */

export type AssetClass = "Equity" | "Index" | "Hybrid" | "Debt" | "Fund of funds" | "Solution" | "Other"

export interface MutualFund {
  /** AMFI's scheme code. */
  code: number
  name: string
  /** The fund house. */
  amc: string
  assetClass: AssetClass
  category: string
  /** The latest NAV, in rupees a unit. */
  nav: number
  /** Its date, YYYY-MM-DD. */
  navDate: string | null
}

/** The asset classes and their categories, in the order the site lists them. */
export const FUND_CATEGORIES: { assetClass: AssetClass; categories: string[] }[] = [
  {
    assetClass: "Equity",
    categories: ["Large cap", "Large and mid cap", "Mid cap", "Small cap", "Multi cap", "Flexi cap", "Focused", "Value and contra", "Dividend yield", "Tax saver (ELSS)", "Sector and theme"],
  },
  { assetClass: "Index", categories: ["Equity index", "Debt index"] },
  { assetClass: "Hybrid", categories: ["Aggressive hybrid", "Balanced advantage", "Multi-asset", "Equity savings", "Conservative hybrid", "Balanced hybrid", "Arbitrage"] },
  {
    assetClass: "Debt",
    categories: [
      "Overnight",
      "Liquid",
      "Money market",
      "Ultra short duration",
      "Low duration",
      "Short duration",
      "Medium duration",
      "Medium to long duration",
      "Long duration",
      "Dynamic bond",
      "Corporate bond",
      "Banking and PSU",
      "Credit risk",
      "Gilt",
      "Floater",
      "Other debt",
    ],
  },
  { assetClass: "Fund of funds", categories: ["Domestic", "Overseas"] },
  { assetClass: "Solution", categories: ["Retirement", "Children"] },
]

/** What each equity category is fairly compared with: the index closest to what its funds may buy. */
export function benchmarkOf(category: string): number | null {
  if (category === "Large cap") return INDEX.NIFTY
  if (category === "Mid cap") return INDEX.MIDCAP150
  if (category === "Small cap") return INDEX.SMALLCAP250
  if (["Large and mid cap", "Multi cap", "Flexi cap", "Focused", "Value and contra", "Dividend yield", "Tax saver (ELSS)", "Sector and theme"].includes(category)) return INDEX.NIFTY500
  return null
}

type Row = [code: number, name: string, amc: string, assetClass: AssetClass, category: string, nav: number, navDate: string | null]

/** The demo's schemes. */
export const MUTUAL_FUNDS: MutualFund[] = (data.schemes as unknown as Row[]).map(([code, name, amc, assetClass, category, nav, navDate]) => ({
  code,
  name,
  amc,
  assetClass,
  category,
  nav,
  navDate,
}))

const byCode = new Map(MUTUAL_FUNDS.map((f) => [f.code, f]))

export function getMutualFund(code: number): MutualFund | undefined {
  return byCode.get(code)
}

// ----------------------------------------------------------------- demo history

interface Model {
  /** An index the fund's equity follows. */
  index?: number
  /** Shares of the portfolio in equity and in gold; the rest is bonds and cash. */
  equity: number
  gold?: number
  /** The bond part's yield and volatility, a year. */
  yieldPct: number
  bondVol: number
  /** Returns beyond the index a year (after costs), and the fund's own wobble. */
  alpha: number
  idio: number
}

const GOLD = COMMODITIES.find((c) => c.symbol === "GOLD")!.id

const MODELS: Record<string, Model> = {
  "Large cap": { index: INDEX.NIFTY, equity: 1, yieldPct: 0, bondVol: 0, alpha: 0.4, idio: 0.03 },
  "Large and mid cap": { index: INDEX.NIFTY500, equity: 1, yieldPct: 0, bondVol: 0, alpha: 1, idio: 0.04 },
  "Mid cap": { index: INDEX.MIDCAP150, equity: 1, yieldPct: 0, bondVol: 0, alpha: 0.8, idio: 0.05 },
  "Small cap": { index: INDEX.SMALLCAP250, equity: 1, yieldPct: 0, bondVol: 0, alpha: 1, idio: 0.06 },
  "Sector and theme": { index: INDEX.NIFTY500, equity: 1, yieldPct: 0, bondVol: 0, alpha: 0, idio: 0.1 },
  "Aggressive hybrid": { index: INDEX.NIFTY500, equity: 0.72, yieldPct: 7.2, bondVol: 0.02, alpha: 0.5, idio: 0.02 },
  "Balanced advantage": { index: INDEX.NIFTY500, equity: 0.5, yieldPct: 7, bondVol: 0.02, alpha: 0.3, idio: 0.02 },
  "Multi-asset": { index: INDEX.NIFTY500, equity: 0.55, gold: 0.15, yieldPct: 7, bondVol: 0.02, alpha: 0.3, idio: 0.02 },
  "Equity savings": { index: INDEX.NIFTY, equity: 0.3, yieldPct: 7, bondVol: 0.015, alpha: 0, idio: 0.01 },
  "Conservative hybrid": { index: INDEX.NIFTY, equity: 0.2, yieldPct: 7.2, bondVol: 0.02, alpha: 0, idio: 0.01 },
  Arbitrage: { equity: 0, yieldPct: 6.8, bondVol: 0.006, alpha: 0, idio: 0.002 },
  Overnight: { equity: 0, yieldPct: 6.2, bondVol: 0.001, alpha: 0, idio: 0.0005 },
  Liquid: { equity: 0, yieldPct: 6.6, bondVol: 0.002, alpha: 0, idio: 0.0008 },
  "Money market": { equity: 0, yieldPct: 7, bondVol: 0.004, alpha: 0, idio: 0.001 },
  "Ultra short duration": { equity: 0, yieldPct: 7, bondVol: 0.006, alpha: 0, idio: 0.002 },
  "Low duration": { equity: 0, yieldPct: 7.1, bondVol: 0.008, alpha: 0, idio: 0.002 },
  "Short duration": { equity: 0, yieldPct: 7.3, bondVol: 0.015, alpha: 0, idio: 0.003 },
  "Corporate bond": { equity: 0, yieldPct: 7.4, bondVol: 0.017, alpha: 0, idio: 0.003 },
  "Banking and PSU": { equity: 0, yieldPct: 7.3, bondVol: 0.016, alpha: 0, idio: 0.003 },
  Floater: { equity: 0, yieldPct: 7.3, bondVol: 0.01, alpha: 0, idio: 0.003 },
  "Credit risk": { equity: 0, yieldPct: 8, bondVol: 0.025, alpha: 0, idio: 0.008 },
  "Medium duration": { equity: 0, yieldPct: 7.4, bondVol: 0.025, alpha: 0, idio: 0.004 },
  "Medium to long duration": { equity: 0, yieldPct: 7.3, bondVol: 0.035, alpha: 0, idio: 0.004 },
  "Dynamic bond": { equity: 0, yieldPct: 7.3, bondVol: 0.035, alpha: 0, idio: 0.004 },
  "Long duration": { equity: 0, yieldPct: 7.2, bondVol: 0.05, alpha: 0, idio: 0.004 },
  Gilt: { equity: 0, yieldPct: 7.1, bondVol: 0.045, alpha: 0, idio: 0.004 },
  Overseas: { equity: 0, yieldPct: 12, bondVol: 0.18, alpha: 0, idio: 0.02 },
  Domestic: { index: INDEX.NIFTY500, equity: 0.6, yieldPct: 7, bondVol: 0.02, alpha: 0, idio: 0.02 },
  Retirement: { index: INDEX.NIFTY500, equity: 0.65, yieldPct: 7, bondVol: 0.02, alpha: 0.3, idio: 0.02 },
  Children: { index: INDEX.NIFTY500, equity: 0.65, yieldPct: 7, bondVol: 0.02, alpha: 0.3, idio: 0.02 },
}
const DIVERSIFIED: Model = { index: INDEX.NIFTY500, equity: 1, yieldPct: 0, bondVol: 0, alpha: 0.7, idio: 0.04 }

/** The index an index fund follows, from its name. */
function indexOfName(name: string): number {
  const n = name.toLowerCase()
  if (/next 50/.test(n)) return INDEX.NEXT50
  if (/midcap 150/.test(n)) return INDEX.MIDCAP150
  if (/smallcap 250/.test(n)) return INDEX.SMALLCAP250
  if (/nifty 500/.test(n)) return INDEX.NIFTY500
  if (/sensex/.test(n)) return INDEX.SENSEX
  if (/bank/.test(n)) return INDEX.BANKNIFTY
  if (/\bit\b/.test(n)) return INDEX.NIFTYIT
  return INDEX.NIFTY
}

function modelOf(f: MutualFund): Model {
  if (f.category === "Equity index") return { index: indexOfName(f.name), equity: 1, yieldPct: 0, bondVol: 0, alpha: -0.2, idio: 0.003 }
  if (f.category === "Debt index") return MODELS["Short duration"]!
  return MODELS[f.category] ?? (f.assetClass === "Debt" ? MODELS["Short duration"]! : DIVERSIFIED)
}

/**
 * The demo NAV `sessions` sessions back to the latest, oldest first: the
 * latest is the scheme's real NAV, and each day before it moves with the
 * model's index, gold and bonds. A session's move depends only on how far
 * back it is, so a year is the tail of five years.
 */
export function demoNavHistory(f: MutualFund, sessions: number, today = new Date()): Point[] {
  const m = modelOf(f)
  const bars = sessions + 1
  const index = m.index != null ? dailyCandles(getInstrument(m.index)!, bars, today) : null
  const gold = m.gold ? dailyCandles(getInstrument(GOLD)!, bars, today) : null
  const times = (index ?? gold ?? dailyCandles(getInstrument(INDEX.NIFTY)!, bars, today)).map((c) => c.time)
  const bondShare = 1 - m.equity - (m.gold ?? 0)
  const back = [f.nav]
  for (let k = 1; k < bars; k++) {
    const i = bars - k
    const rng = mulberry32((hashString(String(f.code)) ^ Math.imul(k, 0x9e3779b1)) >>> 0)
    const rIndex = index ? index[i]!.close / index[i - 1]!.close - 1 : 0
    const rGold = gold ? gold[i]!.close / gold[i - 1]!.close - 1 : 0
    const rBond = m.yieldPct / 100 / 252 + (m.bondVol / Math.sqrt(252)) * gaussian(rng)
    const r = m.equity * rIndex + (m.gold ?? 0) * rGold + bondShare * rBond + m.alpha / 100 / 252 + (m.idio / Math.sqrt(252)) * gaussian(rng)
    back.push(back[k - 1]! / (1 + r))
  }
  return back.reverse().map((v, i) => ({ time: times[i]!, value: Math.round(v * 1e4) / 1e4 }))
}

export interface FundReturns {
  /** The year's change, then annualised (CAGR) over three, five and ten; null without that much history. */
  y1: number | null
  y3: number | null
  y5: number | null
  y10: number | null
}

/** Returns from a NAV history, to its last point: the NAV on or before the same date 1, 3, 5 and 10 years back. */
export function returnsOf(history: Point[]): FundReturns {
  const last = history.at(-1)
  if (!last) return { y1: null, y3: null, y5: null, y10: null }
  const lastDate = new Date(last.time * 1000)
  const at = (years: number) => {
    const cut = Date.UTC(lastDate.getUTCFullYear() - years, lastDate.getUTCMonth(), lastDate.getUTCDate()) / 1000
    let found: Point | undefined
    for (const p of history) {
      if (p.time > cut) break
      found = p
    }
    return found ? (years === 1 ? (last.value / found.value - 1) * 100 : (Math.pow(last.value / found.value, 1 / years) - 1) * 100) : null
  }
  return { y1: at(1), y3: at(3), y5: at(5), y10: at(10) }
}

const returnsCache = new Map<string, FundReturns>()

/** Ten years of weekday sessions and a little over, for the ten-year return. */
export const DEMO_SESSIONS = 2640

/** A demo scheme's returns, from ten years of its simulated NAV; memoised for the IST day. */
export function demoReturns(f: MutualFund, today = new Date()): FundReturns {
  const key = `${f.code}:${istDate(today.getTime())}`
  let r = returnsCache.get(key)
  if (!r) {
    r = returnsOf(demoNavHistory(f, DEMO_SESSIONS, today))
    returnsCache.set(key, r)
    if (returnsCache.size > 500) returnsCache.delete(returnsCache.keys().next().value!)
  }
  return r
}
