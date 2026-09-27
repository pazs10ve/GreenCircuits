import { INDEX, getInstrument } from "../catalog"
import { dailyCandles } from "../history"
import type { Candle, Instrument } from "../types"
import { formatINR, formatNumber, formatPct } from "../format"
import { cagr, maxDrawdown, rollingMax, rsiSeries, xirr } from "./metrics"

/**
 * "Would it have worked?" Small, honest backtests of common investing ideas,
 * run on the demo market's daily history. Each returns two lines to draw, a
 * few numbers side by side, and a one-sentence answer written from the result.
 */

export interface Pt {
  t: number
  v: number
}

export interface ExperimentLine {
  id: string
  label: string
  points: Pt[]
  tone: "ink" | "accent"
}

export interface ExperimentRow {
  label: string
  values: [string, string]
  /** Which column did better, when "better" is meaningful. */
  better?: 0 | 1
}

export interface Experiment {
  id: string
  question: string
  answer: string
  names: [string, string]
  lines: [ExperimentLine, ExperimentLine]
  rows: ExperimentRow[]
  period: string
  assumptions: string
  labHref: string
}

export interface ExperimentOptions {
  years?: number
  /** Daily bars to test on (oldest first). Defaults to the demo generators' history. */
  candles?: Candle[]
}

const IST = 19800
const cache = new Map<string, Candle[]>()

/** Daily history, memoised per instrument, length and IST day. */
function history(inst: Instrument, sessions: number): Candle[] {
  const day = new Date(Date.now() + IST * 1000).toISOString().slice(0, 10)
  const key = `${inst.symbol}:${sessions}:${day}`
  let candles = cache.get(key)
  if (!candles) {
    candles = dailyCandles(inst, sessions)
    cache.set(key, candles)
    if (cache.size > 40) cache.delete(cache.keys().next().value!)
  }
  return candles
}

function istMonth(t: number): number {
  const d = new Date((t + IST) * 1000)
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}

/** Indian financial year (April to March) a bar belongs to. */
function istFinancialYear(t: number): number {
  const d = new Date((t + IST) * 1000)
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
}

function monthYear(t: number): string {
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(t * 1000)
}

function period(candles: Candle[]): string {
  return `${monthYear(candles[0]!.time)} to ${monthYear(candles.at(-1)!.time)}`
}

function nameOf(inst: Instrument): string {
  return inst.id === INDEX.NIFTY ? "the Nifty 50" : inst.name
}

function years(candles: Candle[]): number {
  return (candles.at(-1)!.time - candles[0]!.time) / (365.25 * 86400)
}

const pct1 = (v: number) => formatPct(v, 1, false)
const signedPct0 = (v: number) => formatPct(v, 0)

/** Invest a fixed amount every month, or save it and invest only after a fall. */
export function sipVsDip(
  inst: Instrument,
  { years: span = 10, monthly = 10_000, dip = 0.1, cashRate = 0.06, candles: given }: ExperimentOptions & { monthly?: number; dip?: number; cashRate?: number } = {},
): Experiment {
  const candles = given ?? history(inst, Math.round(252 * span))
  const closes = candles.map((c) => c.close)
  const highs = rollingMax(closes, 250)
  const cashDaily = Math.pow(1 + cashRate, 1 / 252) - 1
  let sipUnits = 0
  let dipUnits = 0
  let cash = 0
  let month = -1
  let months = 0
  let idleMonths = 0
  let buys = 0
  let contributed = 0
  const flows: { date: number; amount: number }[] = []
  const sip: Pt[] = []
  const wait: Pt[] = []

  candles.forEach((c, i) => {
    cash *= 1 + cashDaily
    const m = istMonth(c.time)
    if (m !== month) {
      month = m
      months++
      if (cash > 1) idleMonths++
      sipUnits += monthly / c.close
      cash += monthly
      contributed += monthly
      flows.push({ date: c.time * 1000, amount: -monthly })
    }
    if (cash > 0 && c.close <= highs[i]! * (1 - dip)) {
      dipUnits += cash / c.close
      cash = 0
      buys++
    }
    if (i % 5 === 0 || i === candles.length - 1) {
      sip.push({ t: c.time, v: sipUnits * c.close })
      wait.push({ t: c.time, v: dipUnits * c.close + cash })
    }
  })

  const last = candles.at(-1)!
  const sipEnd = sipUnits * last.close
  const waitEnd = dipUnits * last.close + cash
  const end = last.time * 1000
  const sipIrr = xirr([...flows, { date: end, amount: sipEnd }])
  const waitIrr = xirr([...flows, { date: end, amount: waitEnd }])
  const fall = `${formatNumber(dip * 100, 0)}%`
  const sipWins = sipEnd >= waitEnd

  const answer = sipWins
    ? `Investing every month finished ${formatINR(sipEnd - waitEnd, 0)} ahead. Waiting for ${fall} falls left money in cash in ${idleMonths} of ${months} months; ${nameOf(inst)} rarely fell far enough to use it.`
    : `Waiting for ${fall} falls finished ${formatINR(waitEnd - sipEnd, 0)} ahead. There were ${buys} falls deep enough to buy, and the cash earned ${formatNumber(cashRate * 100, 0)}% while it waited.`

  return {
    id: `sip-vs-dip-${inst.slug}`,
    question:
      inst.id === INDEX.NIFTY
        ? `Invest every month, or wait for a ${fall} fall?`
        : `A monthly SIP in ${inst.name}, or wait for ${fall} falls?`,
    answer,
    names: ["Every month", `Wait for ${fall} falls`],
    lines: [
      { id: "sip", label: "Every month", points: sip, tone: "ink" },
      { id: "wait", label: "Wait for falls", points: wait, tone: "accent" },
    ],
    rows: [
      { label: "Money put in", values: [formatINR(contributed, 0), formatINR(contributed, 0)] },
      { label: "Worth now", values: [formatINR(sipEnd, 0), formatINR(waitEnd, 0)], better: sipWins ? 0 : 1 },
      { label: "Return a year (XIRR)", values: [pct1(sipIrr), pct1(waitIrr)], better: sipIrr >= waitIrr ? 0 : 1 },
      { label: "Months spent in cash", values: ["0", String(idleMonths)] },
    ],
    period: period(candles),
    assumptions: `₹${formatNumber(monthly, 0)} on the first trading day of each month. Waiting cash earns ${formatNumber(cashRate * 100, 0)}% a year and is invested when ${nameOf(inst)} closes ${fall} below its 52-week high. No taxes or charges.`,
    labHref: `/lab/new?template=sip-vs-dip&symbol=${encodeURIComponent(inst.symbol)}`,
  }
}

/** All equity, or 60% equity and 40% bonds reset every April. */
export function balancedMix(
  inst: Instrument,
  { years: span = 10, equity = 0.6, bondRate = 0.07, start = 10_00_000, candles: given }: ExperimentOptions & { equity?: number; bondRate?: number; start?: number } = {},
): Experiment {
  const candles = given ?? history(inst, Math.round(252 * span))
  const bondDaily = Math.pow(1 + bondRate, 1 / 252) - 1
  const c0 = candles[0]!
  const allUnits = start / c0.close
  let units = (equity * start) / c0.close
  let bonds = (1 - equity) * start
  let fy = istFinancialYear(c0.time)
  const all: Pt[] = []
  const mix: Pt[] = []
  const allValues: number[] = []
  const mixValues: number[] = []

  candles.forEach((c, i) => {
    bonds *= 1 + bondDaily
    const y = istFinancialYear(c.time)
    if (y !== fy) {
      fy = y
      const total = units * c.close + bonds
      units = (equity * total) / c.close
      bonds = (1 - equity) * total
    }
    const a = allUnits * c.close
    const m = units * c.close + bonds
    allValues.push(a)
    mixValues.push(m)
    if (i % 5 === 0 || i === candles.length - 1) {
      all.push({ t: c.time, v: a })
      mix.push({ t: c.time, v: m })
    }
  })

  const yrs = years(candles)
  const allCagr = cagr(start, allValues.at(-1)!, yrs)
  const mixCagr = cagr(start, mixValues.at(-1)!, yrs)
  const allDd = maxDrawdown(allValues)
  const mixDd = maxDrawdown(mixValues)
  const worst12 = (vals: number[]) => {
    let worst = Infinity
    for (let i = 250; i < vals.length; i++) worst = Math.min(worst, (vals[i]! / vals[i - 250]! - 1) * 100)
    return worst
  }
  const allW = worst12(allValues)
  const mixW = worst12(mixValues)
  const cost = allCagr - mixCagr
  const bondShare = `${formatNumber((1 - equity) * 100, 0)}%`

  const answer =
    cost > 0
      ? `Keeping ${bondShare} in bonds gave up ${formatNumber(cost, 1)} points of return a year. In exchange, the worst fall was ${signedPct0(mixDd)} instead of ${signedPct0(allDd)}.`
      : `The mix kept up with all-equity here, returning ${pct1(mixCagr)} a year against ${pct1(allCagr)}, with a worst fall of ${signedPct0(mixDd)} instead of ${signedPct0(allDd)}.`

  return {
    id: `balanced-${inst.slug}`,
    question: `What does keeping ${bondShare} in bonds cost you, and what does it save?`,
    answer,
    names: ["All in the Nifty", `${formatNumber(equity * 100, 0)}/${formatNumber((1 - equity) * 100, 0)} mix`],
    lines: [
      { id: "all", label: "All equity", points: all, tone: "ink" },
      { id: "mix", label: `${formatNumber(equity * 100, 0)}/${formatNumber((1 - equity) * 100, 0)}`, points: mix, tone: "accent" },
    ],
    rows: [
      { label: "Return a year", values: [pct1(allCagr), pct1(mixCagr)], better: allCagr >= mixCagr ? 0 : 1 },
      { label: "Worst fall from a peak", values: [signedPct0(allDd), signedPct0(mixDd)], better: allDd >= mixDd ? 0 : 1 },
      { label: "Worst 12 months", values: [signedPct0(allW), signedPct0(mixW)], better: allW >= mixW ? 0 : 1 },
      { label: `₹10 lakh became`, values: [formatINR(allValues.at(-1)!, 0), formatINR(mixValues.at(-1)!, 0)] },
    ],
    period: period(candles),
    assumptions: `₹10 lakh invested on day one. Bonds earn ${formatNumber(bondRate * 100, 0)}% a year. The mix is reset to ${formatNumber(equity * 100, 0)}/${formatNumber((1 - equity) * 100, 0)} on the first trading day of each April. No taxes or charges.`,
    labHref: `/lab/new?template=rebalance&symbol=${encodeURIComponent(inst.symbol)}`,
  }
}

/** Buy when 14-day RSI closes below 30; sell at +10% or after 60 sessions. */
export function oversoldDips(
  inst: Instrument,
  { years: span = 10, start = 10_00_000, cashRate = 0.06, candles: given }: ExperimentOptions & { start?: number; cashRate?: number } = {},
): Experiment {
  const candles = given ?? history(inst, Math.round(252 * span))
  const closes = candles.map((c) => c.close)
  const rsi = rsiSeries(closes, 14)
  const cashDaily = Math.pow(1 + cashRate, 1 / 252) - 1
  let cash = start
  let units = 0
  let entry = 0
  let entryAt = -1
  let pending: "buy" | "sell" | null = null
  let trades = 0
  let wins = 0
  let daysIn = 0
  const hold: Pt[] = []
  const strat: Pt[] = []
  const holdValues: number[] = []
  const stratValues: number[] = []

  candles.forEach((c, i) => {
    if (pending === "buy") {
      units = cash / c.open
      entry = c.open
      entryAt = i
      cash = 0
    } else if (pending === "sell") {
      cash = units * c.open
      trades++
      if (c.open > entry) wins++
      units = 0
    }
    pending = null
    cash *= 1 + cashDaily
    if (units > 0) daysIn++
    const r = rsi[i]!
    const prev = rsi[i - 1]
    if (units === 0 && prev != null && prev >= 30 && r < 30) pending = "buy"
    else if (units > 0 && (c.close >= entry * 1.1 || i - entryAt >= 60)) pending = "sell"
    const s = cash + units * c.close
    const h = (start * c.close) / closes[0]!
    stratValues.push(s)
    holdValues.push(h)
    if (i % 5 === 0 || i === candles.length - 1) {
      hold.push({ t: c.time, v: h })
      strat.push({ t: c.time, v: s })
    }
  })

  const yrs = years(candles)
  const holdCagr = cagr(start, holdValues.at(-1)!, yrs)
  const stratCagr = cagr(start, stratValues.at(-1)!, yrs)
  const invested = (daysIn / candles.length) * 100
  const answer =
    stratCagr < holdCagr
      ? `Buying only when ${nameOf(inst)} looked oversold returned ${pct1(stratCagr)} a year, against ${pct1(holdCagr)} for simply holding. It was invested ${formatNumber(invested, 0)}% of the time and missed most of the rise.`
      : `Buying oversold dips beat holding: ${pct1(stratCagr)} a year against ${pct1(holdCagr)}, with money invested only ${formatNumber(invested, 0)}% of the time.`

  return {
    id: `oversold-${inst.slug}`,
    question: `Does buying ${inst.id === INDEX.NIFTY ? "the Nifty" : inst.name} when it looks oversold beat just holding it?`,
    answer,
    names: ["Just hold", "Buy oversold dips"],
    lines: [
      { id: "hold", label: "Hold", points: hold, tone: "ink" },
      { id: "rsi", label: "RSI dips", points: strat, tone: "accent" },
    ],
    rows: [
      { label: "Return a year", values: [pct1(holdCagr), pct1(stratCagr)], better: holdCagr >= stratCagr ? 0 : 1 },
      { label: "Worst fall from a peak", values: [signedPct0(maxDrawdown(holdValues)), signedPct0(maxDrawdown(stratValues))] },
      { label: "Trades (winners)", values: ["–", `${trades} (${wins})`] },
      { label: "Time invested", values: ["100%", `${formatNumber(invested, 0)}%`] },
    ],
    period: period(candles),
    assumptions: `Buy at the next day's open after the 14-day RSI closes below 30; sell at the next open after a 10% gain or 60 trading days. Idle cash earns ${formatNumber(cashRate * 100, 0)}% a year. No taxes or charges.`,
    labHref: `/lab/new?template=rsi-dip&symbol=${encodeURIComponent(inst.symbol)}`,
  }
}

/** The same monthly SIP in a stock and in the Nifty 50. */
export function sipAgainstIndex(
  inst: Instrument,
  { years: span = 5, monthly = 10_000, candles: given, indexCandles }: ExperimentOptions & { monthly?: number; indexCandles?: Candle[] } = {},
): Experiment {
  const nifty = getInstrument(INDEX.NIFTY)!
  const sessions = Math.round(252 * span)
  const a = given ?? history(inst, sessions)
  const b = indexCandles ?? history(nifty, sessions)
  const run = (candles: Candle[]) => {
    let units = 0
    let month = -1
    const flows: { date: number; amount: number }[] = []
    const pts: Pt[] = []
    candles.forEach((c, i) => {
      const m = istMonth(c.time)
      if (m !== month) {
        month = m
        units += monthly / c.close
        flows.push({ date: c.time * 1000, amount: -monthly })
      }
      if (i % 5 === 0 || i === candles.length - 1) pts.push({ t: c.time, v: units * c.close })
    })
    const end = units * candles.at(-1)!.close
    return { pts, end, flows, irr: xirr([...flows, { date: candles.at(-1)!.time * 1000, amount: end }]) }
  }
  const s = run(a)
  const n = run(b)
  const put = s.flows.length * monthly
  const ahead = s.end >= n.end
  const answer = `${formatINR(monthly, 0)} a month in ${inst.name} would be worth ${formatINR(s.end, 0)} now, ${ahead ? "more" : "less"} than the ${formatINR(n.end, 0)} the same SIP made in the Nifty 50.`

  return {
    id: `sip-index-${inst.slug}`,
    question: `A monthly SIP in ${inst.name}, or in the Nifty 50?`,
    answer,
    names: [inst.symbol, "Nifty 50"],
    lines: [
      { id: "stock", label: inst.symbol, points: s.pts, tone: "ink" },
      { id: "index", label: "Nifty 50", points: n.pts, tone: "accent" },
    ],
    rows: [
      { label: "Money put in", values: [formatINR(put, 0), formatINR(put, 0)] },
      { label: "Worth now", values: [formatINR(s.end, 0), formatINR(n.end, 0)], better: ahead ? 0 : 1 },
      { label: "Return a year (XIRR)", values: [pct1(s.irr), pct1(n.irr)], better: s.irr >= n.irr ? 0 : 1 },
    ],
    period: period(a),
    assumptions: `₹${formatNumber(monthly, 0)} on the first trading day of each month in both. Dividends and taxes are left out.`,
    labHref: `/lab/new?template=sip-vs-index&symbol=${encodeURIComponent(inst.symbol)}`,
  }
}
