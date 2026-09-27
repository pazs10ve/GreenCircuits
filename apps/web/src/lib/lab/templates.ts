import { templateDefinition, type Template } from "@greencircuits/contracts/strategy"
import type { StrategyDefinition } from "@greencircuits/contracts/strategy"
import { EQUITIES, INDEX, INSTRUMENTS, getInstrument } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"

/**
 * The questions the lab starts from. Each is a template from the contracts
 * package applied to a sensible instrument, with a test period that fits the
 * history the demo market has for it.
 */

export interface Question {
  template: Template
  question: string
  blurb: string
  instrumentId: number
  universe?: number[]
}

/** The ten largest Nifty 50 companies by market value: a universe for rules that pick among stocks. */
export const LARGEST_TEN: number[] = [...EQUITIES]
  .sort((a, b) => (b.sharesCr ?? 0) * b.prevClose - (a.sharesCr ?? 0) * a.prevClose)
  .slice(0, 10)
  .map((i) => i.id)

const RELIANCE = EQUITIES.find((i) => i.symbol === "RELIANCE")!.id

export const QUESTIONS: Question[] = [
  {
    template: "sip",
    question: "What would ₹10,000 a month have become?",
    blurb: "A monthly SIP in the Nifty 50, against putting the same money in a fixed deposit.",
    instrumentId: INDEX.NIFTY,
  },
  {
    template: "sip-vs-dip",
    question: "Should you wait for a dip before investing?",
    blurb: "Save each instalment until the market is 10% off its high, against investing every month regardless.",
    instrumentId: INDEX.NIFTY,
  },
  {
    template: "rebalance",
    question: "Is a 60/40 mix worth the return it gives up?",
    blurb: "Equity and bonds, reset every April, against staying fully in equity.",
    instrumentId: INDEX.NIFTY,
  },
  {
    template: "rsi-dip",
    question: "Does buying a stock when it's oversold pay?",
    blurb: "Buy Reliance when its RSI crosses below 30; sell 10% higher or after 60 trading days.",
    instrumentId: RELIANCE,
  },
  {
    template: "trend",
    question: "Does following the trend beat holding on?",
    blurb: "Own the Nifty 50 only while it's above its 200-day average.",
    instrumentId: INDEX.NIFTY,
  },
  {
    template: "breakout",
    question: "Do stocks at a one-year high keep rising?",
    blurb: "Buy large companies that close above last year's high, and ride them with a 10% trailing stop.",
    instrumentId: LARGEST_TEN[0]!,
    universe: LARGEST_TEN,
  },
]

/** How far back the demo market's history goes: ten years for indices, five for everything else. */
export function historyYears(inst: Instrument | undefined): number {
  return inst?.kind === "INDEX" ? 10 : 5
}

/** A period that leaves a year of history before the start for indicators to warm up. */
export function defaultPeriod(ids: number[], today = new Date()): { from: string; to: string } {
  const years = Math.min(...ids.map((id) => historyYears(getInstrument(id)))) - 1
  const ist = new Date(today.getTime() + 5.5 * 3600 * 1000)
  const from = new Date(Date.UTC(ist.getUTCFullYear() - years, ist.getUTCMonth(), 1))
  return { from: from.toISOString().slice(0, 10), to: ist.toISOString().slice(0, 10) }
}

/** The earliest date a test can start on for these instruments. */
export function earliestStart(ids: number[], today = new Date()): string {
  const years = Math.min(...ids.map((id) => historyYears(getInstrument(id))))
  const d = new Date(today.getTime() + 5.5 * 3600 * 1000)
  d.setUTCFullYear(d.getUTCFullYear() - years)
  return d.toISOString().slice(0, 10)
}

/** A template's definition from the URL: ?template=rsi-dip&symbol=RELIANCE. */
export function fromTemplate(template: string | undefined, symbol: string | undefined): StrategyDefinition | null {
  if (!template) return null
  const question = QUESTIONS.find((q) => q.template === template)
  const bySymbol = symbol ? INSTRUMENTS.find((i) => i.symbol === symbol || i.slug === symbol.toLowerCase()) : undefined
  const instrumentId = bySymbol?.id ?? question?.instrumentId ?? INDEX.NIFTY
  const universe = bySymbol ? [bySymbol.id] : (question?.universe ?? [instrumentId])
  return templateDefinition(template, instrumentId, universe)
}
