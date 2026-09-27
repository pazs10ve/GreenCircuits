import type { ExitReason } from "@greencircuits/contracts/lab"
import type { Condition, Operand, StrategyDefinition } from "@greencircuits/contracts/strategy"
import { deliveryCharges } from "./charges"
import { ema, rollingMax, rollingMin, rsi, sma } from "./indicators"
import { xirr } from "./metrics"

/**
 * Backtest simulations on daily bars, as in pipelines/.../lab/simulate.py.
 * Signals are read on a bar's close and filled at the next bar's open, so no
 * decision uses a price it couldn't have known. Long only. Dates are unix
 * seconds at 00:00 UTC on each trading date.
 */

export interface Series {
  dates: number[]
  open: number[]
  high: number[]
  low: number[]
  close: number[]
}

export interface Trade {
  instrumentId: number
  quantity: number
  entryAt: number
  entryPrice: number
  /** "B" for buys (SIP instalments, every long trade), "S" for a rebalancing sale. */
  side: "B" | "S"
  exitAt: number | null
  exitPrice: number | null
  charges: number
  pnl: number | null
  exitReason: ExitReason | null
}

export interface SimResult {
  dates: number[]
  values: number[]
  /** Money added from outside on each day (SIP instalments); zero otherwise. */
  flows: number[]
  trades: Trade[]
  extra: Record<string, number | null>
}

const DAY = 86_400
const zeros = (n: number) => new Array<number>(n).fill(0)
const yearOf = (t: number) => new Date(t * 1000).getUTCFullYear()
const monthOf = (t: number) => new Date(t * 1000).getUTCMonth() + 1

function trade(instrumentId: number, quantity: number, entryAt: number, entryPrice: number, over: Partial<Trade> = {}): Trade {
  return { instrumentId, quantity, entryAt, entryPrice, side: "B", exitAt: null, exitPrice: null, charges: 0, pnl: null, exitReason: null, ...over }
}

/** Interest growth for each date: the calendar days since the previous one. The first entry is 1. */
export function accrual(dates: number[], annualPct: number): number[] {
  return dates.map((t, i) => (i === 0 ? 1 : (1 + annualPct / 100) ** ((t - dates[i - 1]!) / DAY / 365)))
}

/** Daily returns with outside money taken out, so a SIP's instalments don't count as gains. */
export function timeWeighted(values: number[], flows: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!
    const r = prev > 0 ? (values[i]! - flows[i]!) / prev - 1 : 0
    out.push(Number.isFinite(r) ? r : 0)
  }
  return out
}

// ------------------------------------------------------------------------ SIP

export function simulateSip(s: Series, start: number, monthly: number, dip?: { fallPct: number; cashRatePct: number }): SimResult {
  const n = s.dates.length
  const grow = accrual(s.dates, dip ? dip.cashRatePct : 0)
  const fall = dip ? dip.fallPct / 100 : 0
  const high = s.close.map((_, i) => {
    let m = -Infinity
    for (let j = Math.max(0, i - 249); j <= i; j++) m = Math.max(m, s.close[j]!)
    return m
  })
  let units = 0
  let cash = 0
  let month = ""
  const values = zeros(n - start)
  const flows = zeros(n - start)
  const trades: Trade[] = []
  const contributions: [number, number][] = []
  let months = 0
  let idle = 0
  for (let k = 0, i = start; i < n; k++, i++) {
    const d = s.dates[i]!
    if (k) cash *= grow[i]!
    const key = `${yearOf(d)}-${monthOf(d)}`
    if (key !== month) {
      month = key
      months++
      if (cash > 1) idle++
      cash += monthly
      flows[k] = monthly
      contributions.push([d, -monthly])
    }
    if (cash > 0 && (!dip || s.close[i]! <= high[i]! * (1 - fall))) {
      const qty = cash / s.close[i]!
      units += qty
      trades.push(trade(0, qty, d, s.close[i]!))
      cash = 0
    }
    values[k] = units * s.close[i]! + cash
  }
  let invested = 0
  for (const [, a] of contributions) invested += -a
  return {
    dates: s.dates.slice(start),
    values,
    flows,
    trades,
    extra: {
      invested,
      xirr: xirr([...contributions, [s.dates.at(-1)!, values.at(-1)!]]),
      months,
      months_in_cash: idle,
      buys: trades.length,
    },
  }
}

/** The same monthly instalments put in a deposit that earns `ratePct` a year. */
export function simulateDeposit(dates: number[], start: number, monthly: number, ratePct: number): SimResult {
  const n = dates.length
  const grow = accrual(dates, ratePct)
  let cash = 0
  let month = ""
  const values = zeros(n - start)
  const flows = zeros(n - start)
  const contributions: [number, number][] = []
  for (let k = 0, i = start; i < n; k++, i++) {
    const d = dates[i]!
    if (k) cash *= grow[i]!
    const key = `${yearOf(d)}-${monthOf(d)}`
    if (key !== month) {
      month = key
      cash += monthly
      flows[k] = monthly
      contributions.push([d, -monthly])
    }
    values[k] = cash
  }
  let invested = 0
  for (const [, a] of contributions) invested += -a
  return {
    dates: dates.slice(start),
    values,
    flows,
    trades: [],
    extra: { invested, xirr: xirr([...contributions, [dates.at(-1)!, values.at(-1)!]]) },
  }
}

// ------------------------------------------------------------------ rebalance

function financialYear(t: number): number {
  return monthOf(t) >= 4 ? yearOf(t) : yearOf(t) - 1
}

/** Hold equityPct in the instrument and the rest in bonds, reset every April. */
export function simulateRebalance(s: Series, start: number, capital: number, equityPct: number, bondRatePct: number): SimResult {
  const n = s.dates.length
  const w = equityPct / 100
  const grow = accrual(s.dates, bondRatePct)
  let units = (capital * w) / s.close[start]!
  let bonds = capital * (1 - w)
  let fy = financialYear(s.dates[start]!)
  const values = zeros(n - start)
  const trades: Trade[] = units > 0 ? [trade(0, units, s.dates[start]!, s.close[start]!)] : []
  let rebalances = 0
  for (let k = 0, i = start; i < n; k++, i++) {
    if (k) bonds *= grow[i]!
    if (financialYear(s.dates[i]!) !== fy) {
      fy = financialYear(s.dates[i]!)
      const total = units * s.close[i]! + bonds
      const target = (total * w) / s.close[i]!
      if (Math.abs(target - units) > 1e-9) {
        trades.push(trade(0, Math.abs(target - units), s.dates[i]!, s.close[i]!, { side: target < units ? "S" : "B" }))
      }
      units = target
      bonds = total * (1 - w)
      rebalances++
    }
    values[k] = units * s.close[i]! + bonds
  }
  return { dates: s.dates.slice(start), values, flows: zeros(n - start), trades, extra: { rebalances } }
}

/** Split the capital equally across the universe on the first day and hold it. */
export function simulateHold(universe: Map<number, Series>, start: number, capital: number, costs: boolean): SimResult {
  const ids = [...universe.keys()]
  const first = universe.get(ids[0]!)!
  const n = first.dates.length
  const budget = capital / ids.length
  const units = new Map<number, number>()
  const trades: Trade[] = []
  for (const i of ids) {
    const s = universe.get(i)!
    const price = s.close[start]!
    const fee = costs ? deliveryCharges(budget, "B") : 0
    units.set(i, (budget - fee) / price)
    trades.push(trade(i, units.get(i)!, s.dates[start]!, price, { charges: fee }))
  }
  const values = zeros(n - start)
  for (let k = 0, t = start; t < n; k++, t++) {
    let v = 0
    for (const i of ids) v += units.get(i)! * universe.get(i)!.close[t]!
    values[k] = v
  }
  return { dates: first.dates.slice(start), values, flows: zeros(n - start), trades, extra: {} }
}

// ---------------------------------------------------------------------- rules

export function operand(s: Series, o: Operand): number[] {
  switch (o.kind) {
    case "price":
      return s.close
    case "value":
      return s.close.map(() => o.value)
    case "sma":
      return sma(s.close, o.period)
    case "ema":
      return ema(s.close, o.period)
    case "rsi":
      return rsi(s.close, o.period)
    case "high":
      return rollingMax(s.high, o.period)
    case "low":
      return rollingMin(s.low, o.period)
  }
}

/** Where the condition holds on each bar's close (false while an input is NaN). */
export function conditionSeries(s: Series, c: Condition): boolean[] {
  const left = operand(s, c.left)
  const right = operand(s, c.right)
  const valid = left.map((l, i) => !(Number.isNaN(l) || Number.isNaN(right[i]!)))
  return left.map((l, i) => {
    const r = right[i]!
    if (!valid[i]) return false
    if (c.op === ">") return l > r
    if (c.op === "<") return l < r
    if (i === 0 || !valid[i - 1]) return false
    const pl = left[i - 1]!
    const pr = right[i - 1]!
    return c.op === "crosses_above" ? l > r && pl <= pr : l < r && pl >= pr
  })
}

type Rules = Extract<StrategyDefinition, { type: "rules" }>

interface Position {
  qty: number
  entryIdx: number
  peak: number
  trade: Trade
}

export function simulateRules(universe: Map<number, Series>, start: number, d: Rules, capital: number, slippageBps: number): SimResult {
  const ids = [...universe.keys()]
  const dates = universe.get(ids[0]!)!.dates
  const n = dates.length
  const any = d.entryLogic === "ANY"
  const entries = new Map<number, boolean[]>()
  const exitsWhen = new Map<number, boolean[] | null>()
  for (const i of ids) {
    const s = universe.get(i)!
    const conds = d.entry.map((c) => conditionSeries(s, c))
    entries.set(i, dates.map((_, t) => (any ? conds.some((c) => c[t]) : conds.every((c) => c[t]))))
    const when = d.exit.when?.length ? d.exit.when.map((c) => conditionSeries(s, c)) : null
    exitsWhen.set(i, when ? dates.map((_, t) => when.some((c) => c[t])) : null)
  }
  const ex = d.exit
  const maxPos = Math.trunc(d.maxPositions ?? 5)
  const costs = (d.costs ?? "DELIVERY") === "DELIVERY"
  const grow = accrual(dates, d.cashRatePct ?? 0)
  const slip = slippageBps / 10_000

  let cash = capital
  const open = new Map<number, Position>()
  let pendingEntry: number[] = []
  const pendingExit = new Map<number, ExitReason>()
  const closed: Trade[] = []
  const values = zeros(n - start)
  let daysInvested = 0

  const close = (i: number, p: Position, t: number, price: number, fee: number, reason: ExitReason) => {
    p.trade.exitAt = dates[t]!
    p.trade.exitPrice = price
    p.trade.charges += fee
    p.trade.pnl = (price - p.trade.entryPrice) * p.qty - p.trade.charges
    p.trade.exitReason = reason
    closed.push(p.trade)
  }

  for (let k = 0, t = start; t < n; k++, t++) {
    if (k) cash *= grow[t]!
    // 1. Fill yesterday's decisions at today's open.
    for (const [i, reason] of [...pendingExit]) {
      const p = open.get(i)!
      open.delete(i)
      const price = universe.get(i)!.open[t]! * (1 - slip)
      const turnover = price * p.qty
      const fee = costs ? deliveryCharges(turnover, "S") : 0
      cash += turnover - fee
      close(i, p, t, price, fee, reason)
    }
    pendingExit.clear()
    for (const i of pendingEntry) {
      const slots = maxPos - open.size
      if (slots <= 0 || open.has(i)) continue
      const price = universe.get(i)!.open[t]! * (1 + slip)
      const budget = cash / slots
      const qty = price > 0 ? Math.floor(budget / (price * 1.0012)) : 0 // leave room for charges
      if (qty < 1) continue
      const turnover = price * qty
      const fee = costs ? deliveryCharges(turnover, "B") : 0
      cash -= turnover + fee
      open.set(i, { qty, entryIdx: t, peak: price, trade: trade(i, qty, dates[t]!, price, { charges: fee }) })
    }
    pendingEntry = []

    // 2. Mark to market on the close and read today's signals for tomorrow.
    let held = 0
    for (const [i, p] of open) {
      const c = universe.get(i)!.close[t]!
      held += p.qty * c
      p.peak = Math.max(p.peak, c)
      const entry = p.trade.entryPrice
      let reason: ExitReason | null = null
      if (ex.stopPct && c <= entry * (1 - ex.stopPct / 100)) reason = "STOP"
      else if (ex.targetPct && c >= entry * (1 + ex.targetPct / 100)) reason = "TARGET"
      else if (ex.trailPct && c <= p.peak * (1 - ex.trailPct / 100)) reason = "TRAIL"
      else if (ex.maxBars && t - p.entryIdx >= ex.maxBars) reason = "TIME"
      else if (exitsWhen.get(i)?.[t]) reason = "SIGNAL"
      if (reason && t < n - 1) pendingExit.set(i, reason)
    }
    if (open.size) daysInvested++
    values[k] = cash + held
    if (t < n - 1) pendingEntry = ids.filter((i) => !open.has(i) && entries.get(i)![t])
  }

  // Close what's still open at the last close, so every trade has a result.
  for (const [i, p] of open) {
    const price = universe.get(i)!.close[n - 1]!
    const fee = costs ? deliveryCharges(price * p.qty, "S") : 0
    close(i, p, n - 1, price, fee, "END_OF_TEST")
  }

  const wins = closed.filter((tr) => tr.pnl && tr.pnl > 0).map((tr) => tr.pnl!)
  const losses = closed.filter((tr) => tr.pnl != null && tr.pnl <= 0).map((tr) => -tr.pnl!)
  const holds = closed.filter((tr) => tr.exitAt != null).map((tr) => (tr.exitAt! - tr.entryAt) / DAY)
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const lossSum = sum(losses)
  return {
    dates: dates.slice(start),
    values,
    flows: zeros(n - start),
    trades: [...closed].sort((a, b) => a.entryAt - b.entryAt),
    extra: {
      trades: closed.length,
      win_rate: closed.length ? wins.length / closed.length : 0,
      profit_factor: losses.length && lossSum > 0 ? sum(wins) / lossSum : null,
      avg_hold_days: holds.length ? sum(holds) / holds.length : 0,
      exposure: daysInvested / Math.max(1, n - start),
      charges: sum(closed.map((tr) => tr.charges)),
    },
  }
}
