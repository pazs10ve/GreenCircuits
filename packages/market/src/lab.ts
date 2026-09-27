import { gaussian, hashString, mulberry32, pick, roundTo } from "./random"
import { EQUITIES } from "./catalog"

/**
 * Strategy-lab sample data. Backtest results are generated from a seeded return
 * series and every headline metric is computed from that series, so the
 * numbers on the page agree with the curves drawn. Real runs will come from the
 * Python engine through the BullMQ "backtests" queue.
 */

export type StrategyStyle = "RULES" | "OPTIONS"

export interface Strategy {
  id: string
  name: string
  style: StrategyStyle
  description: string
  universe: string
  entry: string
  exit: string
  sizing: string
  interval: "1d" | "15m" | "5m"
  version: number
  updatedAt: Date
  tags: string[]
  seed: number
}

const DAY = 86400000

export const SAMPLE_STRATEGIES: Strategy[] = [
  {
    id: "rsi-dip",
    name: "RSI dip in uptrend",
    style: "RULES",
    description: "Buy oversold large caps that are still above their 200-day average.",
    universe: "NIFTY 200 members, as of each date",
    entry: "rsi(close, 14) crosses_below 30 and close > sma(close, 200)",
    exit: "stop 6% · target 12% · trail 4% · rsi(close, 14) > 60 · max 20 bars",
    sizing: "1% risk per trade · max 10 positions",
    interval: "1d",
    version: 3,
    updatedAt: new Date(Date.now() - 2 * DAY),
    tags: ["mean reversion", "equities"],
    seed: 2076,
  },
  {
    id: "breakout-52w",
    name: "52-week breakout",
    style: "RULES",
    description: "Buy fresh 52-week highs on above-average delivery volume.",
    universe: "NIFTY 500 members, as of each date",
    entry: "close > max(high, 250)[1] and delivery_pct > avg(delivery_pct, 20) * 1.3",
    exit: "trail 8% · close < sma(close, 50)",
    sizing: "Equal weight · max 15 positions",
    interval: "1d",
    version: 5,
    updatedAt: new Date(Date.now() - 6 * DAY),
    tags: ["momentum", "equities"],
    seed: 2304,
  },
  {
    id: "straddle-0920",
    name: "Expiry-day short straddle",
    style: "OPTIONS",
    description: "Sell the ATM NIFTY straddle at 09:20 on expiry day with a 25% stop on each leg.",
    universe: "NIFTY weekly options",
    entry: "time == 09:20 and is_expiry_day",
    exit: "stop 25% per leg · exit 15:15",
    sizing: "1 lot per leg",
    interval: "5m",
    version: 2,
    updatedAt: new Date(Date.now() - 12 * DAY),
    tags: ["options", "theta"],
    seed: 1487,
  },
  {
    id: "sector-rotation",
    name: "Monthly sector rotation",
    style: "RULES",
    description: "Hold the three strongest sectors by 3-month return, rebalanced monthly.",
    universe: "Nifty sector indices",
    entry: "rank(return(close, 63)) <= 3 on first trading day of month",
    exit: "rank(return(close, 63)) > 3 at rebalance",
    sizing: "Equal weight · 3 positions",
    interval: "1d",
    version: 1,
    updatedAt: new Date(Date.now() - 20 * DAY),
    tags: ["rotation", "indices"],
    seed: 728,
  },
]

export interface Point {
  time: number // unix seconds
  value: number
}

export interface Metrics {
  cagr: number
  maxDrawdown: number
  sharpe: number
  sortino: number
  calmar: number
  monthsUp: number
}

export interface Trade {
  no: number
  symbol: string
  side: "LONG" | "SHORT"
  entryDate: Date
  exitDate: Date
  entry: number
  exit: number
  qty: number
  pnl: number
  returnPct: number
  reason: "TARGET" | "STOP" | "TRAIL" | "SIGNAL" | "TIME"
}

export interface BacktestResult {
  strategyId: string
  from: Date
  to: Date
  capital: number
  finalValue: number
  equity: Point[]
  benchmark: Point[]
  drawdown: Point[]
  metrics: Metrics
  benchmarkMetrics: Metrics
  inSampleCagr: number
  outOfSampleCagr: number
  splitDate: Date
  monthly: Map<number, (number | null)[]>
  trades: Trade[]
  winRate: number
  profitFactor: number
  avgHoldDays: number
}

function metricsFor(rets: number[], eq: number[], days: Date[], start: number): Metrics {
  const years = (days.at(-1)!.getTime() - days[0]!.getTime()) / (365.25 * DAY)
  const cagr = (Math.pow(eq.at(-1)! / start, 1 / years) - 1) * 100
  let peak = start
  let mdd = 0
  for (const v of eq) {
    peak = Math.max(peak, v)
    mdd = Math.min(mdd, v / peak - 1)
  }
  const rf = 0.065 / 250
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const sd = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1))
  const down = Math.sqrt(rets.reduce((a, r) => a + Math.min(r - rf, 0) ** 2, 0) / rets.length)
  const months = new Map<string, number>()
  days.forEach((d, i) => {
    const k = `${d.getUTCFullYear()}-${d.getUTCMonth()}`
    months.set(k, (months.get(k) ?? 1) * (1 + rets[i]!))
  })
  const up = [...months.values()].filter((v) => v > 1).length / months.size
  return {
    cagr,
    maxDrawdown: mdd * 100,
    sharpe: ((mean - rf) / sd) * Math.sqrt(250),
    sortino: ((mean - rf) / down) * Math.sqrt(250),
    calmar: cagr / Math.abs(mdd * 100),
    monthsUp: up * 100,
  }
}

export function runSampleBacktest(strategy: Strategy, capital = 1_000_000, now = new Date()): BacktestResult {
  const rng = mulberry32(strategy.seed)
  const days: Date[] = []
  const d = new Date(Date.UTC(2016, 0, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  while (d <= end) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(new Date(d))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  const rb: number[] = []
  const rs: number[] = []
  for (const day of days) {
    let b: number
    let s: number
    const t = day.getTime()
    if (t >= Date.UTC(2020, 1, 20) && t <= Date.UTC(2020, 2, 23)) {
      b = gaussian(rng) * 0.028 - 0.016
      s = 0.45 * b + gaussian(rng) * 0.006
    } else if (t > Date.UTC(2020, 2, 23) && t <= Date.UTC(2020, 6, 31)) {
      b = gaussian(rng) * 0.018 + 0.0035
      s = 0.00035 + 0.6 * b + gaussian(rng) * 0.006
    } else {
      b = gaussian(rng) * 0.0102 + 0.00046
      s = 0.00031 + 0.6 * b + gaussian(rng) * 0.0055
    }
    rb.push(b)
    rs.push(s)
  }
  const curve = (rets: number[]) => {
    let v = capital
    return rets.map((r) => (v *= 1 + r))
  }
  const es = curve(rs)
  const eb = curve(rb)
  let peak = capital
  const drawdown = es.map((v, i) => {
    peak = Math.max(peak, v)
    return { time: Math.floor(days[i]!.getTime() / 1000), value: (v / peak - 1) * 100 }
  })
  const split = days.findIndex((day) => day.getUTCFullYear() === 2023)
  const isYears = (days[split - 1]!.getTime() - days[0]!.getTime()) / (365.25 * DAY)
  const oosYears = (days.at(-1)!.getTime() - days[split]!.getTime()) / (365.25 * DAY)

  const monthly = new Map<number, (number | null)[]>()
  days.forEach((day, i) => {
    const y = day.getUTCFullYear()
    if (!monthly.has(y)) monthly.set(y, Array(12).fill(null))
    const row = monthly.get(y)!
    const m = day.getUTCMonth()
    row[m] = ((row[m] ?? 0) + 1) * (1 + rs[i]!) - 1
  })

  // Sample trade list for the Trades tab.
  const trng = mulberry32(hashString(strategy.id))
  const trades: Trade[] = []
  const symbols = EQUITIES.map((e) => e)
  for (let i = 0; i < 184; i++) {
    const idx = Math.floor((i / 184) * (days.length - 30) + trng() * 20)
    const hold = 3 + Math.floor(trng() * 18)
    const entryDate = days[idx]!
    const exitDate = days[Math.min(days.length - 1, idx + hold)]!
    const inst = pick(trng, symbols)
    const win = trng() < 0.47
    const ret = win ? 0.03 + trng() * 0.09 : -(0.015 + trng() * 0.045)
    const entry = roundTo(inst.prevClose * (0.55 + (idx / days.length) * 0.5) * (0.9 + trng() * 0.2), inst.tick)
    const qty = Math.max(1, Math.floor((capital * 0.1) / entry))
    const exit = roundTo(entry * (1 + ret), inst.tick)
    trades.push({
      no: i + 1,
      symbol: inst.symbol,
      side: "LONG",
      entryDate,
      exitDate,
      entry,
      exit,
      qty,
      pnl: (exit - entry) * qty,
      returnPct: ret * 100,
      reason: win ? (trng() < 0.6 ? "TARGET" : "SIGNAL") : trng() < 0.7 ? "STOP" : trng() < 0.5 ? "TRAIL" : "TIME",
    })
  }
  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))

  return {
    strategyId: strategy.id,
    from: days[0]!,
    to: days.at(-1)!,
    capital,
    finalValue: es.at(-1)!,
    equity: es.map((v, i) => ({ time: Math.floor(days[i]!.getTime() / 1000), value: v })),
    benchmark: eb.map((v, i) => ({ time: Math.floor(days[i]!.getTime() / 1000), value: v })),
    drawdown,
    metrics: metricsFor(rs, es, days, capital),
    benchmarkMetrics: metricsFor(rb, eb, days, capital),
    inSampleCagr: (Math.pow(es[split - 1]! / capital, 1 / isYears) - 1) * 100,
    outOfSampleCagr: (Math.pow(es.at(-1)! / es[split - 1]!, 1 / oosYears) - 1) * 100,
    splitDate: days[split]!,
    monthly,
    trades,
    winRate: (wins.length / trades.length) * 100,
    profitFactor: grossWin / Math.max(1, grossLoss),
    avgHoldDays: trades.reduce((s, t) => s + (t.exitDate.getTime() - t.entryDate.getTime()) / DAY, 0) / trades.length,
  }
}

export function getStrategy(id: string): Strategy | undefined {
  return SAMPLE_STRATEGIES.find((s) => s.id === id)
}
