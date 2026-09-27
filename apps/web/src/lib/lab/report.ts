import { EQUITIES } from "@greencircuits/market/catalog"
import { runSampleBacktest, type BacktestResult, type Metrics, type Point, type Strategy } from "@greencircuits/market/lab"
import { hashString, mulberry32 } from "@greencircuits/market/random"
import { DAY_MS, istDateKey } from "./dates"

/**
 * Turns a sample BacktestResult into plain data for the report page: numbers
 * and arrays only (no Map, no Date), downsampled curves for the chart, and the
 * derived figures the tiles and robustness panel show. Everything is computed
 * from the same series, so the page agrees with itself.
 */

const cache = new Map<string, BacktestResult>()

/** runSampleBacktest is deterministic for a date; memoise per strategy per IST day. */
export function sampleResult(strategy: Strategy, now: Date): BacktestResult {
  const key = `${strategy.id}:${istDateKey(now)}`
  let r = cache.get(key)
  if (!r) {
    r = runSampleBacktest(strategy, 1_000_000, now)
    if (cache.size > 32) cache.clear()
    cache.set(key, r)
  }
  return r
}

export interface TradeRow {
  no: number
  symbol: string
  slug?: string
  side: "LONG" | "SHORT"
  entryDate: number
  exitDate: number
  entry: number
  exit: number
  qty: number
  pnl: number
  returnPct: number
  holdDays: number
  reason: string
}

export interface MonthRow {
  year: number
  months: (number | null)[]
  total: number
}

export interface Sensitivity {
  rowLabel: string
  colLabel: string
  rows: string[]
  cols: string[]
  values: number[][]
  chosen: [number, number]
}

export interface ReportData {
  from: number
  to: number
  splitTime: number
  capital: number
  finalValue: number
  totalReturnPct: number
  equity: Point[]
  benchmark: Point[]
  drawdown: Point[]
  metrics: Metrics
  benchmarkMetrics: Metrics
  inSampleCagr: number
  outOfSampleCagr: number
  benchmarkIsCagr: number
  benchmarkOosCagr: number
  monthly: MonthRow[]
  trades: TradeRow[]
  winRate: number
  profitFactor: number
  avgHoldDays: number
  tradesPerYear: number
  longestDrawdownDays: number
  bestMonth: { pct: number; label: string }
  worstMonth: { pct: number; label: string }
  sensitivity: Sensitivity
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Keep about `target` points: the last value in each bucket, plus any forced indices (the split). */
function downsample(points: Point[], target: number, force: number[] = [], pick: "last" | "min" = "last"): Point[] {
  const step = Math.max(1, Math.ceil(points.length / target))
  const out: Point[] = [points[0]!]
  for (let i = 1; i < points.length; i += step) {
    const bucket = points.slice(i, Math.min(points.length, i + step))
    out.push(pick === "min" ? bucket.reduce((m, p) => (p.value < m.value ? p : m)) : bucket.at(-1)!)
  }
  for (const f of force) if (points[f]) out.push(points[f])
  out.push(points.at(-1)!)
  const seen = new Set<number>()
  return out.filter((p) => !seen.has(p.time) && seen.add(p.time)).sort((a, b) => a.time - b.time)
}

const SENSITIVITY: Record<string, { rowLabel: string; colLabel: string; rows: string[]; cols: string[]; chosen: [number, number]; falloff: number }> = {
  "rsi-dip": { rowLabel: "RSI entry level", colLabel: "Stop-loss", rows: ["25", "30", "35", "40"], cols: ["4%", "5%", "6%", "7%", "8%"], chosen: [1, 2], falloff: 0.55 },
  "breakout-52w": { rowLabel: "Breakout lookback", colLabel: "Trailing stop", rows: ["150", "200", "250", "300"], cols: ["6%", "7%", "8%", "9%", "10%"], chosen: [2, 2], falloff: 0.8 },
  "straddle-0920": { rowLabel: "Entry time", colLabel: "Stop per leg", rows: ["09:20", "09:30", "09:45", "10:00"], cols: ["15%", "20%", "25%", "30%", "35%"], chosen: [0, 2], falloff: 2.4 },
  "sector-rotation": { rowLabel: "Momentum lookback", colLabel: "Sectors held", rows: ["21", "42", "63", "126"], cols: ["2", "3", "4", "5"], chosen: [2, 1], falloff: 0.7 },
}

/** A sample parameter sweep centred on the chosen settings, whose cell equals the reported CAGR. */
function sensitivityFor(strategy: Strategy, cagr: number): Sensitivity {
  const s = SENSITIVITY[strategy.id] ?? SENSITIVITY["rsi-dip"]!
  const rng = mulberry32(strategy.seed ^ 0x51f7)
  const [cr, cc] = s.chosen
  const values = s.rows.map((_, r) =>
    s.cols.map((__, c) => {
      if (r === cr && c === cc) return cagr
      const dist = (r - cr) ** 2 + (c - cc) ** 2
      return cagr - s.falloff * dist - (rng() - 0.35) * 1.4
    }),
  )
  return { rowLabel: s.rowLabel, colLabel: s.colLabel, rows: s.rows, cols: s.cols, values, chosen: s.chosen }
}

function cagrBetween(start: number, end: number, fromMs: number, toMs: number): number {
  const years = (toMs - fromMs) / (365.25 * DAY_MS)
  return years > 0 ? (Math.pow(end / start, 1 / years) - 1) * 100 : 0
}

export function buildReport(strategy: Strategy, now: Date): ReportData {
  const r = sampleResult(strategy, now)
  const splitTime = Math.floor(r.splitDate.getTime() / 1000)
  const splitIdx = r.equity.findIndex((p) => p.time >= splitTime)

  // Benchmark CAGR on each side of the split, from the full-resolution series.
  const b = r.benchmark
  const bIs = cagrBetween(r.capital, b[splitIdx - 1]!.value, b[0]!.time * 1000, b[splitIdx - 1]!.time * 1000)
  const bOos = cagrBetween(b[splitIdx - 1]!.value, b.at(-1)!.value, b[splitIdx]!.time * 1000, b.at(-1)!.time * 1000)

  // Longest stretch below a previous peak, in calendar days.
  let longest = 0
  let start: number | null = null
  for (const p of r.drawdown) {
    if (p.value < 0 && start == null) start = p.time
    if (p.value >= 0 && start != null) {
      longest = Math.max(longest, p.time - start)
      start = null
    }
  }
  if (start != null) longest = Math.max(longest, r.drawdown.at(-1)!.time - start)

  const monthly: MonthRow[] = [...r.monthly.entries()].map(([year, months]) => {
    const pct = months.map((m) => (m == null ? null : m * 100))
    const total = (months.reduce<number>((acc, m) => acc * (1 + (m ?? 0)), 1) - 1) * 100
    return { year, months: pct, total }
  })
  let best = { pct: -Infinity, label: "" }
  let worst = { pct: Infinity, label: "" }
  for (const row of monthly) {
    row.months.forEach((m, i) => {
      if (m == null) return
      if (m > best.pct) best = { pct: m, label: `${MONTHS[i]} ${row.year}` }
      if (m < worst.pct) worst = { pct: m, label: `${MONTHS[i]} ${row.year}` }
    })
  }

  const slugs = new Map(EQUITIES.map((e) => [e.symbol, e.slug]))
  const trades: TradeRow[] = r.trades.map((t) => ({
    no: t.no,
    symbol: t.symbol,
    slug: slugs.get(t.symbol),
    side: t.side,
    entryDate: t.entryDate.getTime(),
    exitDate: t.exitDate.getTime(),
    entry: t.entry,
    exit: t.exit,
    qty: t.qty,
    pnl: t.pnl,
    returnPct: t.returnPct,
    holdDays: Math.round((t.exitDate.getTime() - t.entryDate.getTime()) / DAY_MS),
    reason: t.reason,
  }))

  const years = (r.to.getTime() - r.from.getTime()) / (365.25 * DAY_MS)
  return {
    from: r.from.getTime(),
    to: r.to.getTime(),
    splitTime,
    capital: r.capital,
    finalValue: r.finalValue,
    totalReturnPct: (r.finalValue / r.capital - 1) * 100,
    equity: downsample(r.equity, 900, [splitIdx]),
    benchmark: downsample(r.benchmark, 900, [splitIdx]),
    drawdown: downsample(r.drawdown, 900, [], "min"),
    metrics: r.metrics,
    benchmarkMetrics: r.benchmarkMetrics,
    inSampleCagr: r.inSampleCagr,
    outOfSampleCagr: r.outOfSampleCagr,
    benchmarkIsCagr: bIs,
    benchmarkOosCagr: bOos,
    monthly,
    trades,
    winRate: r.winRate,
    profitFactor: r.profitFactor,
    avgHoldDays: r.avgHoldDays,
    tradesPerYear: trades.length / years,
    longestDrawdownDays: Math.round(longest / 86400),
    bestMonth: best,
    worstMonth: worst,
    sensitivity: sensitivityFor(strategy, r.metrics.cagr),
  }
}

/** Equity sparkline and headline numbers for the strategies list. */
export function strategySummary(strategy: Strategy, now: Date) {
  const r = sampleResult(strategy, now)
  const step = Math.ceil(r.equity.length / 48)
  const spark = r.equity.filter((_, i) => i % step === 0 || i === r.equity.length - 1).map((p) => p.value)
  return { cagr: r.metrics.cagr, maxDrawdown: r.metrics.maxDrawdown, sharpe: r.metrics.sharpe, benchmarkCagr: r.benchmarkMetrics.cagr, spark, from: r.from.getTime(), to: r.to.getTime() }
}

/** Short hex id, stable for a given seed text (run ids are uuids in lab.backtest_run; the UI shows the first 8 characters). */
export function shortId(seed: string): string {
  return hashString(seed).toString(16).padStart(8, "0")
}
