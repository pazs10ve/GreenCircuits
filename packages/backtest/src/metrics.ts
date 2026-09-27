import type { Summary } from "@greencircuits/contracts/lab"
import { npMean, npStd1, npSum, pyRound } from "./numeric"

/** Return and risk metrics, as in pipelines/.../lab/metrics.py. Dates are unix seconds. */

export const TRADING_DAYS = 252
export const RISK_FREE = 0.065 // a year, roughly the 1-year T-bill

const DAY = 86_400

export function maxDrawdown(values: number[]): number {
  if (!values.length) return 0
  let peak = -Infinity
  let worst = Infinity
  for (const v of values) {
    peak = Math.max(peak, v)
    worst = Math.min(worst, v / peak - 1)
  }
  return worst
}

export function drawdownSeries(values: number[]): number[] {
  let peak = -Infinity
  return values.map((v) => {
    peak = Math.max(peak, v)
    return v / peak - 1
  })
}

/** CAGR, volatility, Sharpe, Sortino, max drawdown and Calmar from time-weighted daily returns. */
export function summarise(rets: number[], dates: number[]): Summary {
  if (rets.length < 2) return { cagr: 0, volatility: 0, sharpe: 0, sortino: 0, max_drawdown: 0, calmar: 0 }
  const growth: number[] = []
  let g = 1
  for (const r of rets) {
    g *= 1 + r
    growth.push(g)
  }
  const years = Math.max((dates.at(-1)! - dates[0]!) / DAY / 365.25, 1 / 365)
  const c = growth.at(-1)! ** (1 / years) - 1
  const rf = RISK_FREE / TRADING_DAYS
  const excess = rets.map((r) => r - rf)
  const vol = npStd1(rets) * Math.sqrt(TRADING_DAYS)
  const downside =
    Math.sqrt(
      npMean(
        excess.map((e) => {
          const m = Math.min(e, 0)
          return m * m
        }),
      ),
    ) * Math.sqrt(TRADING_DAYS)
  const meanExcess = npMean(excess)
  const mdd = maxDrawdown([1, ...growth])
  return {
    cagr: c,
    volatility: vol,
    sharpe: vol > 0 ? (meanExcess * TRADING_DAYS) / vol : 0,
    sortino: downside > 0 ? (meanExcess * TRADING_DAYS) / downside : 0,
    max_drawdown: mdd,
    calmar: mdd < 0 ? c / Math.abs(mdd) : 0,
  }
}

function monthKey(t: number): string {
  const d = new Date(t * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/** {"2024-01": 0.021, ...}, compounded from time-weighted daily returns. */
export function monthlyReturns(rets: number[], dates: number[]): Record<string, number> {
  const out = new Map<string, number>()
  rets.forEach((r, i) => {
    const key = monthKey(dates[i]!)
    out.set(key, (1 + (out.get(key) ?? 0)) * (1 + r) - 1)
  })
  return Object.fromEntries([...out].map(([k, v]) => [k, pyRound(v, 6)]))
}

/** Annualised internal rate of return for dated cash flows (money in negative), by bisection. */
export function xirr(flows: [number, number][]): number {
  if (flows.length < 2) return 0
  const t0 = flows[0]![0]
  const years = flows.map(([t]) => (t - t0) / DAY / 365)
  const amounts = flows.map(([, a]) => a)
  const npv = (r: number) => npSum(amounts.map((a, i) => a / (1 + r) ** years[i]!))
  let lo = -0.99
  let hi = 10
  if (npv(lo) * npv(hi) > 0) return 0
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    if (npv(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Indices that keep at most `limit` points, always including the last. */
export function downsample(n: number, limit = 2000): number[] {
  if (n <= limit) return Array.from({ length: n }, (_, i) => i)
  const step = n / limit
  const set = new Set<number>()
  for (let i = 0; i < limit; i++) set.add(Math.floor(i * step))
  set.add(n - 1)
  return [...set].sort((a, b) => a - b)
}
