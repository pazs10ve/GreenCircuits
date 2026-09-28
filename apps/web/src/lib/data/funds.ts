import { cache } from "react"
import { getInstrument } from "@greencircuits/market/catalog"
import { DEMO_SESSIONS, MUTUAL_FUNDS, benchmarkOf, demoNavHistory, demoReturns, getMutualFund, returnsOf, type FundReturns, type MutualFund } from "@greencircuits/market/funds"
import { dailyCandles } from "@greencircuits/market/history"
import type { Candle, Point } from "@greencircuits/market/types"
import { liveGet } from "./market"

/** A scheme as the pages show it (the API's shape). */
export interface SchemeRow {
  code: number
  name: string
  amc: string
  assetClass: string
  category: string
  nav: number | null
  navDate: string | null
  launchedOn: string | null
  y1: number | null
  y3: number | null
  y5: number | null
  y10: number | null
}

export interface CategorySummary {
  assetClass: string
  category: string
  schemes: number
  /** Median returns of the category's schemes: a year's, then annualised over three and five. */
  y1: number | null
  y3: number | null
  y5: number | null
}

function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b)
  if (v.length === 0) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2
}

/** A demo scheme's row. Its history is simulated, so it has no launch date to report. */
function demoRow(f: MutualFund): SchemeRow {
  return {
    code: f.code,
    name: f.name,
    amc: f.amc,
    assetClass: f.assetClass,
    category: f.category,
    nav: f.nav,
    navDate: f.navDate,
    launchedOn: null,
    ...demoReturns(f),
  }
}

/** Every category with its size and median returns: the API's, else the demo sample's. */
export const getFundCategories = cache(async (): Promise<{ categories: CategorySummary[]; source: "api" | "demo" }> => {
  const api = await liveGet<{ categories: CategorySummary[] }>("/v1/funds/mutual/categories", { revalidate: 300 })
  if (api?.categories.length) return { categories: api.categories, source: "api" }
  const groups = new Map<string, MutualFund[]>()
  for (const f of MUTUAL_FUNDS) groups.set(f.category, [...(groups.get(f.category) ?? []), f])
  return {
    categories: [...groups].map(([category, funds]) => {
      const returns = funds.map((f) => demoReturns(f))
      return {
        assetClass: funds[0]!.assetClass,
        category,
        schemes: funds.length,
        y1: median(returns.map((r) => r.y1)),
        y3: median(returns.map((r) => r.y3)),
        y5: median(returns.map((r) => r.y5)),
      }
    }),
    source: "demo",
  }
})

/** One category's schemes, with returns. */
export async function getSchemes(category: string): Promise<SchemeRow[]> {
  const api = await liveGet<{ schemes: SchemeRow[] }>(`/v1/funds/mutual?category=${encodeURIComponent(category)}`, { revalidate: 300 })
  if (api) return api.schemes
  return MUTUAL_FUNDS.filter((f) => f.category === category).map(demoRow)
}

/** A scheme and its NAV history (unix seconds and NAV, oldest first). */
export async function getScheme(code: number): Promise<{ scheme: SchemeRow; history: Point[] } | null> {
  const api = await liveGet<{ scheme: SchemeRow; history: [string, number][] }>(`/v1/funds/mutual/${code}`, { revalidate: 300 })
  if (api) return { scheme: api.scheme, history: api.history.map(([d, v]) => ({ time: Date.parse(`${d}T00:00:00Z`) / 1000, value: v })) }
  const f = getMutualFund(code)
  if (!f) return null
  return { scheme: demoRow(f), history: demoNavHistory(f, DEMO_SESSIONS) }
}

/** How the index a category is measured against did over the same spans: from the API's bars, else the demo's. */
export async function benchmarkReturns(category: string): Promise<{ id: number; name: string; returns: FundReturns } | null> {
  const id = benchmarkOf(category)
  const inst = id != null ? getInstrument(id) : undefined
  if (id == null || !inst) return null
  const api = await liveGet<{ candles: Candle[] }>(`/v1/instruments/${id}/candles?sessions=2600`, { revalidate: 300 })
  const candles = api?.candles.length ? api.candles : dailyCandles(inst, DEMO_SESSIONS)
  return { id, name: inst.name, returns: returnsOf(candles.map((c) => ({ time: c.time, value: c.close }))) }
}
