import type { AlternativeMetrics, RunInfo, RunMetrics, RunResult, Summary } from "@greencircuits/contracts/lab"
import { INDEX } from "@greencircuits/market/catalog"
import { formatNumber } from "@greencircuits/market/format"
import { alternativeOf, money, pct, points } from "./describe"

/**
 * The report's words, written from the numbers: a lede that says what
 * happened, a verdict against the alternative, and whether the result held up
 * on the part of the period that was held out.
 */

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Money-weighted for SIPs (what a fund statement shows), time-weighted otherwise. */
export function yearly(m: RunMetrics | AlternativeMetrics, sip: boolean): number {
  return sip ? (m.xirr ?? m.cagr) : m.cagr
}

export function lede(run: RunInfo, result: RunResult): string {
  const d = run.definition
  const m = result.metrics
  const alt = m.alternative
  const other = alternativeOf(alt.kind, d)
  const sentences: string[] = []
  if (d.type === "sip") {
    const r = yearly(m, true)
    sentences.push(
      `${money(m.invested ?? 0)} put in over ${m.months} months is worth ${money(m.final_value)}, ${r >= 0 ? "a return of" : "a loss of"} ${pct(Math.abs(r))} a year.`,
    )
    sentences.push(`${capitalise(other.phrase)} would be worth ${money(alt.final_value)} (${pct(yearly(alt, true))} a year).`)
  } else {
    const grew = m.final_value >= run.initial_capital
    sentences.push(
      `${money(run.initial_capital)} ${grew ? "grew to" : "shrank to"} ${money(m.final_value)}, ${pct(m.cagr)} a year${d.type === "rules" ? ` over ${m.trades} ${m.trades === 1 ? "trade" : "trades"}` : ""}.`,
    )
    sentences.push(`${capitalise(other.phrase)} would have ended at ${money(alt.final_value)} (${pct(alt.cagr)} a year).`)
  }
  // Risk, when it differs enough to matter.
  const gap = Math.abs(m.max_drawdown) - Math.abs(alt.max_drawdown)
  if (Math.abs(gap) >= 0.03 && alt.max_drawdown !== 0) {
    sentences.push(
      gap < 0
        ? `It was calmer, though: its worst fall from a peak was ${pct(-m.max_drawdown, { digits: 0 })}, against ${pct(-alt.max_drawdown, { digits: 0 })}.`
        : `It was also bumpier: its worst fall from a peak was ${pct(-m.max_drawdown, { digits: 0 })}, against ${pct(-alt.max_drawdown, { digits: 0 })}.`,
    )
  }
  return sentences.join(" ")
}

export type Tone = "up" | "down" | "flat"

/** "Beat a fixed deposit by 2.1 points a year", coloured by the outcome. */
export function verdict(run: RunInfo, result: RunResult): { tone: Tone; text: string } {
  const sip = run.definition.type === "sip"
  const m = result.metrics
  const other = alternativeOf(m.alternative.kind, run.definition)
  const diff = yearly(m, sip) - yearly(m.alternative, sip)
  if (Math.abs(diff) < 0.0025) return { tone: "flat", text: `Level with ${other.versus}` }
  return diff > 0
    ? { tone: "up", text: `Beat ${other.versus} by ${points(diff)} a year` }
    : { tone: "down", text: `Trailed ${other.versus} by ${points(-diff)} a year` }
}

/** Whether an edge in the first part of the period survived in the held-out part. */
export function holdUp(result: RunResult): string {
  const m = result.metrics
  const a = m.alternative
  const early = m.in_sample.cagr - a.in_sample.cagr
  const late = m.out_of_sample.cagr - a.out_of_sample.cagr
  if (early > 0.0025 && late > 0.0025)
    return `It did better than the alternative in both parts: by ${points(early)} a year before, and ${points(late)} a year in the held-out part. An edge that survives on data the rules weren't shaped on is a better sign, though still no promise.`
  if (early > 0.0025)
    return `It did better than the alternative in the first part but not in the held-out part. If you adjusted the rules to look good on this history, that's the warning sign: they may describe the past rather than anticipate the future.`
  if (late > 0.0025)
    return `It trailed the alternative in the first part and did better in the held-out part, so there's no consistent edge either way.`
  return `It trailed the alternative in both parts of the period.`
}

export interface NumberRow {
  label: string
  values: string[]
  /** Index of the better value, when "better" means something. */
  better?: number
  hint?: string
}

/** The numbers table: the strategy, the alternative and, for lump sums, the Nifty 50. */
export function numberRows(run: RunInfo, result: RunResult): { columns: string[]; rows: NumberRow[] } {
  const d = run.definition
  const m = result.metrics
  const a = m.alternative
  const sip = d.type === "sip"
  const other = alternativeOf(a.kind, d)
  const b = result.benchmark
  // A third column for the market, unless the alternative already is the Nifty 50.
  const withMarket = !sip && !(d.type === "rules" && d.universe.length === 1 && d.universe[0] === INDEX.NIFTY) && !(d.type === "rebalance" && d.instrumentId === INDEX.NIFTY)
  const bFinal = result.equity_sample.at(-1)?.b
  const columns = ["This test", other.label, ...(withMarket ? ["Nifty 50"] : [])]
  const best = (xs: number[], higher = true) => {
    const target = higher ? Math.max(...xs) : Math.min(...xs)
    return xs.filter((x) => x === target).length === 1 ? xs.indexOf(target) : undefined
  }
  const three = <T,>(s: T, alt: T, market: T) => (withMarket ? [s, alt, market] : [s, alt])
  const summary = (f: (x: Summary) => number) => three(f(m), f(a), f(b))

  const rows: NumberRow[] = []
  if (sip) {
    rows.push({ label: "Money put in", values: [money(m.invested ?? 0), money(m.invested ?? 0)] })
    rows.push({ label: "Worth at the end", values: [money(m.final_value), money(a.final_value)], better: best([m.final_value, a.final_value]) })
    const r = [yearly(m, true), yearly(a, true)]
    rows.push({ label: "Return a year", values: r.map((v) => pct(v)), better: best(r), hint: "XIRR: the yearly rate that turns each instalment into what it's worth now." })
  } else {
    const finals = three(m.final_value, a.final_value, bFinal ?? 0)
    rows.push({ label: "Worth at the end", values: finals.map(money), better: best(finals) })
    const cagr = summary((x) => x.cagr)
    rows.push({ label: "Return a year", values: cagr.map((v) => pct(v)), better: best(cagr), hint: "CAGR: the steady yearly rate that gets from the start to the end." })
  }
  const dd = sip ? [m.max_drawdown, a.max_drawdown] : summary((x) => x.max_drawdown)
  rows.push({ label: "Worst fall from a peak", values: dd.map((v) => pct(v)), better: best(dd), hint: "Maximum drawdown, on time-weighted returns so new money can't hide a fall." })
  const vol = sip ? [m.volatility, a.volatility] : summary((x) => x.volatility)
  // A deposit's only "swing" is weekend interest landing on Mondays; call it what it is.
  const volText = vol.map((v, i) => (i === 1 && a.kind === "deposit" ? "None" : pct(v)))
  rows.push({ label: "Ups and downs", values: volText, better: best(vol, false), hint: "Volatility: how much returns swing, as a yearly figure." })
  if (!sip) {
    const sharpe = summary((x) => x.sharpe)
    rows.push({ label: "Return for the risk", values: sharpe.map((v) => formatNumber(v, 2)), better: best(sharpe), hint: "Sharpe ratio: return above a 6.5% risk-free rate, per unit of volatility." })
  }
  if (sip && d.type === "sip" && d.dip) {
    rows.push({ label: "Times it bought", values: [String(m.buys ?? 0), String(m.months ?? 0)] })
    rows.push({ label: "Months with cash waiting", values: [String(m.months_in_cash ?? 0), "0"] })
  }
  return { columns, rows }
}

/** Monthly returns as a year-by-month grid, newest year first, with each year's total. */
export function monthGrid(monthly: Record<string, number>): { year: number; months: (number | null)[]; total: number }[] {
  const years = new Map<number, (number | null)[]>()
  for (const [key, r] of Object.entries(monthly)) {
    const [y, mo] = key.split("-").map(Number) as [number, number]
    const row = years.get(y) ?? Array<number | null>(12).fill(null)
    row[mo - 1] = r
    years.set(y, row)
  }
  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({ year, months, total: months.reduce<number>((acc, r) => (r == null ? acc : (1 + acc) * (1 + r) - 1), 0) }))
}

export const EXIT_REASONS: Record<string, string> = {
  TARGET: "Target",
  STOP: "Stop loss",
  TRAIL: "Trailing stop",
  TIME: "Time limit",
  SIGNAL: "Sell signal",
  END_OF_TEST: "Test ended",
}

/** The deepest fall in the chart: from which peak, to which trough, and when (if ever) it was made back. */
export function worstFall(sample: { t: number; dd: number }[]): { depth: number; peak: number; trough: number; recovered: number | null } | null {
  if (!sample.length) return null
  let trough = 0
  for (let i = 1; i < sample.length; i++) if (sample[i]!.dd < sample[trough]!.dd) trough = i
  if (sample[trough]!.dd >= 0) return null
  let peak = trough
  while (peak > 0 && sample[peak]!.dd < 0) peak--
  let recovered: number | null = null
  for (let i = trough + 1; i < sample.length; i++) {
    if (sample[i]!.dd >= 0) {
      recovered = sample[i]!.t
      break
    }
  }
  return { depth: sample[trough]!.dd, peak: sample[peak]!.t, trough: sample[trough]!.t, recovered }
}
