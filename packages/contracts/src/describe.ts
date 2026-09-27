import type { AlternativeKind, AlternativeMetrics, RunMetrics } from "./lab"
import type { Condition, Operand, StrategyDefinition } from "./strategy"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import { formatNumber } from "@greencircuits/market/format"

/**
 * Strategies and results in plain words. The lab's builder, its report, the
 * API's feed and the browser's feed all describe things the same way, so what
 * you set up is what you read back, wherever you read it.
 */

type Rules = Extract<StrategyDefinition, { type: "rules" }>

/** "Reliance Industries", or "the Nifty 50" for an index, so it reads in a sentence. */
export function nameOf(id: number, { article = true }: { article?: boolean } = {}): string {
  const inst = getInstrument(id)
  if (!inst) return "an unknown instrument"
  return inst.kind === "INDEX" && article ? `the ${inst.name}` : inst.name
}

/** A name that can start a sentence or a label: "Nifty 50", "Reliance Industries". */
export function shortName(id: number): string {
  return nameOf(id, { article: false })
}

/** Rupees in lakh and crore, the way people say them: ₹56,000 · ₹5.6 lakh · ₹1.24 crore. */
export function money(v: number): string {
  const sign = v < 0 ? "−" : ""
  const a = Math.abs(v)
  if (a >= 1e7) return `${sign}₹${trim((a / 1e7).toFixed(2))} crore`
  if (a >= 1e5) return `${sign}₹${trim((a / 1e5).toFixed(a >= 1e6 ? 1 : 2))} lakh`
  return `${sign}₹${formatNumber(a, 0)}`
}

/** Compact rupees for chart axes: ₹56K · ₹5.6L · ₹1.2Cr. */
export function moneyAxis(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e7) return `₹${trim((v / 1e7).toFixed(1))}Cr`
  if (a >= 1e5) return `₹${trim((v / 1e5).toFixed(a >= 1e6 ? 0 : 1))}L`
  if (a >= 1e3) return `₹${trim((v / 1e3).toFixed(0))}K`
  return `₹${formatNumber(v, 0)}`
}

function trim(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text
}

/** 0.1409 → "14.1%"; signed adds "+" or a true minus. */
export function pct(v: number, { digits = 1, signed = false }: { digits?: number; signed?: boolean } = {}): string {
  const text = `${formatNumber(Math.abs(v * 100), digits)}%`
  if (Math.abs(v * 100) < 0.5 * 10 ** -digits) return `${formatNumber(0, digits)}%`
  return v < 0 ? `−${text}` : signed ? `+${text}` : text
}

/** Percentage points between two rates, for "beat it by 2.3 points a year". */
export function points(v: number): string {
  const n = Math.abs(v * 100)
  return `${formatNumber(n, n < 10 ? 1 : 0)} ${n === 1 ? "point" : "points"}`
}

// ------------------------------------------------------------------- operands

export const OPERAND_KINDS: { kind: Operand["kind"]; label: string; needsPeriod: boolean }[] = [
  { kind: "price", label: "Price", needsPeriod: false },
  { kind: "sma", label: "Average", needsPeriod: true },
  { kind: "ema", label: "Exponential average", needsPeriod: true },
  { kind: "rsi", label: "RSI", needsPeriod: true },
  { kind: "high", label: "Highest high", needsPeriod: true },
  { kind: "low", label: "Lowest low", needsPeriod: true },
  { kind: "value", label: "A number", needsPeriod: false },
]

export const OPS: { op: Condition["op"]; label: string }[] = [
  { op: "crosses_above", label: "crosses above" },
  { op: "crosses_below", label: "crosses below" },
  { op: ">", label: "is above" },
  { op: "<", label: "is below" },
]

/** How an operand reads in a sentence: "its 14-day RSI", "its 200-day average", "30". */
export function operandText(o: Operand): string {
  switch (o.kind) {
    case "price":
      return "the price"
    case "value":
      return formatNumber(o.value, Number.isInteger(o.value) ? 0 : 2)
    case "sma":
      return `its ${o.period}-day average`
    case "ema":
      return `its ${o.period}-day exponential average`
    case "rsi":
      return `its ${o.period}-day RSI`
    case "high":
      return `its highest high of the previous ${o.period} days`
    case "low":
      return `its lowest low of the previous ${o.period} days`
  }
}

export function conditionText(c: Condition): string {
  const op = OPS.find((o) => o.op === c.op)!.label
  return `${operandText(c.left)} ${op} ${operandText(c.right)}`
}

function list(items: string[], joiner: "and" | "or"): string {
  if (items.length <= 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} ${joiner} ${items.at(-1)}`
}

/** "Reliance Industries", "Reliance Industries, HDFC Bank or TCS", "any of 12 stocks". */
export function universeText(ids: number[], joiner: "and" | "or" = "or"): string {
  if (ids.length <= 3) return list(ids.map((id) => nameOf(id)), joiner)
  return joiner === "or" ? `any of ${ids.length} stocks` : `${ids.length} stocks`
}

// --------------------------------------------------------------- strategies

/** "Monthly SIP · Nifty 50", for lists. */
export function kindLabel(d: StrategyDefinition): string {
  switch (d.type) {
    case "sip":
      return `${d.dip ? "SIP that waits for dips" : "Monthly SIP"} · ${shortName(d.instrumentId)}`
    case "rebalance":
      return `${d.equityPct}/${100 - d.equityPct} mix · ${shortName(d.instrumentId)}`
    case "rules":
      return `Rules · ${d.universe.length === 1 ? shortName(d.universe[0]!) : `${d.universe.length} stocks`}`
  }
}

/** A default name for a test, until the person types their own. */
export function defaultName(d: StrategyDefinition): string {
  switch (d.type) {
    case "sip":
      return d.dip ? `${shortName(d.instrumentId)}: wait for ${d.dip.fallPct}% dips` : `SIP in ${shortName(d.instrumentId)}`
    case "rebalance":
      return `${d.equityPct}/${100 - d.equityPct} ${shortName(d.instrumentId)} and bonds`
    case "rules": {
      const first = d.entry[0]
      let idea = "Rules"
      if (first?.left.kind === "rsi" && (first.op === "crosses_below" || first.op === "<")) idea = "RSI dip"
      else if (first?.left.kind === "price" && (first.right.kind === "sma" || first.right.kind === "ema") && first.op !== "<") idea = "Trend"
      else if (first?.left.kind === "price" && first.right.kind === "high") idea = "Breakout"
      return `${idea} on ${d.universe.length === 1 ? shortName(d.universe[0]!) : `${d.universe.length} stocks`}`
    }
  }
}

/** Exit rules as clauses: "it's 10% above the buying price", "60 trading days have passed". */
export function exitClauses(exit: Rules["exit"]): string[] {
  const out: string[] = []
  if (exit.targetPct != null) out.push(`it's ${formatNumber(exit.targetPct, 0)}% above the buying price`)
  if (exit.stopPct != null) out.push(`it's ${formatNumber(exit.stopPct, 0)}% below the buying price`)
  if (exit.trailPct != null) out.push(`it falls ${formatNumber(exit.trailPct, 0)}% from its highest close since buying`)
  if (exit.maxBars != null) out.push(`${exit.maxBars} trading days have passed`)
  for (const c of exit.when ?? []) out.push(conditionText(c))
  return out
}

/** The whole strategy as a few sentences. `capital` is the starting money for lump-sum strategies. */
export function describe(d: StrategyDefinition, capital?: number): string[] {
  switch (d.type) {
    case "sip": {
      const name = nameOf(d.instrumentId)
      const out = [`Invest ${money(d.monthly)} on the first trading day of every month in ${name}.`]
      if (d.dip) {
        out.push(
          `Instead of buying straight away, keep each instalment in cash earning ${formatNumber(d.dip.cashRatePct, 0)}% a year until ${name} closes ${formatNumber(d.dip.fallPct, 0)}% below its 52-week high, then invest everything saved.`,
        )
      }
      return out
    }
    case "rebalance":
      return [
        `${capital ? `Start with ${money(capital)}: put` : "Put"} ${d.equityPct}% in ${nameOf(d.instrumentId)} and ${100 - d.equityPct}% in bonds earning ${formatNumber(d.bondRatePct, 0)}% a year.`,
        `Every April, move money between them to get back to ${d.equityPct}/${100 - d.equityPct}.`,
      ]
    case "rules": {
      const joiner = d.entryLogic === "ANY" ? "or" : "and"
      const conditions = d.entry.map(conditionText)
      const out = [`Buy ${universeText(d.universe)} when ${list(conditions, joiner)}.`]
      const exits = exitClauses(d.exit)
      if (exits.length) out.push(`Sell when ${list(exits, "or")}.`)
      const sizing =
        d.universe.length > 1 && d.maxPositions > 1
          ? `Hold up to ${d.maxPositions} at a time, splitting the cash equally`
          : "Put all the cash in each time"
      out.push(`${sizing}${capital ? `, starting with ${money(capital)}` : ""}. ${d.costs === "DELIVERY" ? "Indian delivery charges are paid on every trade." : "No charges."}`)
      return out
    }
  }
}

// -------------------------------------------------------------- alternatives

/**
 * What the strategy is compared with: a chart label ("Nifty 50 SIP"), a phrase
 * that can start a sentence ("the same SIP in the Nifty 50") and a short
 * object for verdicts ("beat a fixed deposit").
 */
export function alternativeOf(kind: AlternativeKind, d: StrategyDefinition): { label: string; phrase: string; versus: string } {
  switch (kind) {
    case "plain_sip":
      return { label: "Every month", phrase: "investing every month anyway", versus: "investing every month" }
    case "sip_in_benchmark":
      return { label: "Nifty 50 SIP", phrase: "the same SIP in the Nifty 50", versus: "a Nifty 50 SIP" }
    case "deposit":
      return { label: "Fixed deposit", phrase: "the same money in a 7% fixed deposit", versus: "a fixed deposit" }
    case "all_equity": {
      const id = d.type === "rebalance" ? d.instrumentId : INDEX.NIFTY
      return { label: "All equity", phrase: `keeping everything in ${nameOf(id)}`, versus: "staying in equity" }
    }
    case "buy_and_hold": {
      const ids = d.type === "rules" ? d.universe : []
      return {
        label: "Buy and hold",
        phrase: ids.length === 1 ? `buying ${nameOf(ids[0]!)} on day one and holding it` : `buying all ${ids.length} on day one and holding them`,
        versus: "buying and holding",
      }
    }
  }
}

/** The alternative a definition will be compared with, before it has run (mirrors the engine). */
export function alternativeKindFor(d: StrategyDefinition): AlternativeKind {
  if (d.type === "sip") return d.dip ? "plain_sip" : d.instrumentId === INDEX.NIFTY ? "deposit" : "sip_in_benchmark"
  return d.type === "rebalance" ? "all_equity" : "buy_and_hold"
}

// -------------------------------------------------------------------- verdicts

/** Money-weighted for SIPs (what a fund statement shows), time-weighted otherwise. */
export function yearly(m: Pick<RunMetrics | AlternativeMetrics, "cagr" | "xirr">, sip: boolean): number {
  return sip ? (m.xirr ?? m.cagr) : m.cagr
}

export type Tone = "up" | "down" | "flat"

/** "Beat a fixed deposit by 2.1 points a year", with a tone for colouring it. */
export function verdictOf(d: StrategyDefinition, m: RunMetrics): { tone: Tone; text: string } {
  const sip = d.type === "sip"
  const other = alternativeOf(m.alternative.kind, d)
  const diff = yearly(m, sip) - yearly(m.alternative, sip)
  if (Math.abs(diff) < 0.0025) return { tone: "flat", text: `Level with ${other.versus}` }
  return diff > 0
    ? { tone: "up", text: `Beat ${other.versus} by ${points(diff)} a year` }
    : { tone: "down", text: `Trailed ${other.versus} by ${points(-diff)} a year` }
}
