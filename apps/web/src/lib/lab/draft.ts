import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import { COST_PRESETS, type CostModel } from "./costs"

/**
 * The strategy builder's working copy. It is plain data (strings, numbers,
 * booleans) so the server page can prefill it and hand it to the client.
 * dsl.ts turns it into the rules text the engine parses.
 */

export type Interval = "1d" | "15m" | "5m"
export type Style = "RULES" | "OPTIONS"
export type Comparator = ">" | "<" | "crosses_above" | "crosses_below"
export type IndicatorId = "price" | "sma" | "ema" | "rsi" | "macd" | "bb" | "atr" | "volume" | "vwap" | "supertrend"
export type OperandKind = IndicatorId | "number"
export type PriceField = "close" | "open" | "high" | "low"
export type MacdLine = "line" | "signal" | "histogram"
export type Band = "upper" | "middle" | "lower"

/** One side of a comparison. Every parameter is kept so switching kind and back loses nothing. */
export interface Operand {
  kind: OperandKind
  period: number
  field: PriceField
  line: MacdLine
  band: Band
  mult: number
  value: number
}

export type Rule =
  | { id: string; kind: "compare"; left: Operand; op: Comparator; right: Operand }
  | { id: string; kind: "raw"; text: string }

export type UniverseKind = "symbol" | "index" | "watchlist" | "screen"
export type SizingMode = "fixed" | "percent" | "equal" | "risk"
export type CostPresetId = "delivery" | "intraday" | "fno"
export type LegInstrument = "CE" | "PE" | "FUT"

export interface Leg {
  id: string
  action: "BUY" | "SELL"
  instrument: LegInstrument
  strike: string
  lots: number
}

export interface Draft {
  templateId?: string
  name: string
  description: string
  style: Style
  universe: {
    kind: UniverseKind
    symbolId: number
    index: string
    pointInTime: boolean
    watchlistId: string
    screen: string
  }
  interval: Interval
  from: string
  to: string
  split: string
  entry: { join: "and" | "or"; rules: Rule[] }
  exit: {
    stopOn: boolean
    stopPct: number
    targetOn: boolean
    targetPct: number
    trailOn: boolean
    trailPct: number
    timeOn: boolean
    maxBars: number
    opposite: boolean
    signalOn: boolean
    signal: Rule
  }
  sizing: {
    mode: SizingMode
    fixedInr: number
    percent: number
    riskPct: number
    atrMult: number
    maxPositions: number
    hedgeOn: boolean
    hedgeSymbolId: number
    hedgeRatio: number
  }
  options: {
    underlyingId: number
    expiry: "weekly" | "monthly"
    entryTime: string
    daysToExpiry: number
    exitTime: string
    legs: Leg[]
    stopPerLegPct: number
    targetOn: boolean
    targetPct: number
    adjust: boolean
  }
  costs: { preset: CostPresetId; model: CostModel }
  capital: number
  benchmark: string
}

export const INDICATORS: Record<IndicatorId, { label: string; hint: string; params: ("period" | "field" | "line" | "band" | "mult")[] }> = {
  price: { label: "Price", hint: "Bar open, high, low or close", params: ["field"] },
  sma: { label: "SMA", hint: "Simple moving average of close", params: ["period"] },
  ema: { label: "EMA", hint: "Exponential moving average of close", params: ["period"] },
  rsi: { label: "RSI", hint: "Relative strength index, 0–100", params: ["period"] },
  macd: { label: "MACD", hint: "12, 26, 9 on close", params: ["line"] },
  bb: { label: "Bollinger band", hint: "Band around an SMA, in standard deviations", params: ["band", "period", "mult"] },
  atr: { label: "ATR", hint: "Average true range in ₹", params: ["period"] },
  volume: { label: "Volume", hint: "Period 1 is the bar's volume; more is an average", params: ["period"] },
  vwap: { label: "VWAP", hint: "Volume-weighted average price, resets each session", params: [] },
  supertrend: { label: "Supertrend", hint: "ATR period and multiplier", params: ["period", "mult"] },
}

export const COMPARATORS: { value: Comparator; label: string }[] = [
  { value: ">", label: "is above" },
  { value: "<", label: "is below" },
  { value: "crosses_above", label: "crosses above" },
  { value: "crosses_below", label: "crosses below" },
]

/** Index universes with their constituent counts. Membership is taken as of each date. */
export const UNIVERSES: { id: string; label: string; members: number; note?: string }[] = [
  { id: "nifty50", label: "NIFTY 50", members: 50 },
  { id: "nifty100", label: "NIFTY 100", members: 100 },
  { id: "nifty200", label: "NIFTY 200", members: 200 },
  { id: "nifty500", label: "NIFTY 500", members: 500 },
  { id: "midcap150", label: "NIFTY MIDCAP 150", members: 150 },
  { id: "banknifty", label: "NIFTY BANK", members: 12 },
  { id: "niftyit", label: "NIFTY IT", members: 10 },
  { id: "sensex", label: "SENSEX", members: 30 },
  { id: "sectors", label: "Nifty sector indices", members: 12, note: "Trades the indices themselves" },
]

export const BENCHMARKS = ["NIFTY 50 TRI", "NIFTY 500 TRI", "NIFTY MIDCAP 150 TRI", "SENSEX TRI"]

export const STRIKES = ["ATM", "OTM 1", "OTM 2", "OTM 3", "OTM 5", "ITM 1", "ITM 2", "16 delta", "25 delta", "30 delta"]

/** F&O underlyings. Only NIFTY (NSE) and SENSEX (BSE) kept weekly expiries after SEBI's November 2024 changes. */
export const UNDERLYINGS = [INDEX.NIFTY, INDEX.BANKNIFTY, INDEX.FINNIFTY, INDEX.SENSEX]
export const WEEKLY_UNDERLYINGS: number[] = [INDEX.NIFTY, INDEX.SENSEX]
/** NSE weekly expiries fall on Tuesday and BSE's on Thursday (since September 2025). */
export function expiryWeekday(underlyingId: number): string {
  return underlyingId === INDEX.SENSEX ? "Thursday" : "Tuesday"
}

export function operand(kind: OperandKind, patch: Partial<Operand> = {}): Operand {
  const period = kind === "rsi" || kind === "atr" ? 14 : kind === "sma" ? 50 : kind === "supertrend" ? 10 : kind === "volume" ? 1 : 20
  return { kind, period, field: "close", line: "line", band: "lower", mult: kind === "supertrend" ? 3 : 2, value: 0, ...patch }
}

export const num = (value: number) => operand("number", { value })

export function compare(id: string, left: Operand, op: Comparator, right: Operand): Rule {
  return { id, kind: "compare", left, op, right }
}

export function raw(id: string, text: string): Rule {
  return { id, kind: "raw", text }
}

export function costsFor(preset: CostPresetId, style: Style): { preset: CostPresetId; model: CostModel } {
  const id = preset === "fno" ? (style === "OPTIONS" ? "options" : "futures") : preset
  return { preset, model: { ...COST_PRESETS[id].model } }
}

/** A blank rules strategy over the given dates. */
export function blankDraft(from: string, to: string, split: string): Draft {
  return {
    name: "Untitled strategy",
    description: "",
    style: "RULES",
    universe: { kind: "index", symbolId: 100, index: "nifty100", pointInTime: true, watchlistId: "core", screen: "" },
    interval: "1d",
    from,
    to,
    split,
    entry: { join: "and", rules: [compare("r1", operand("rsi"), "crosses_below", num(30))] },
    exit: {
      stopOn: true,
      stopPct: 5,
      targetOn: true,
      targetPct: 10,
      trailOn: false,
      trailPct: 4,
      timeOn: false,
      maxBars: 20,
      opposite: false,
      signalOn: false,
      signal: compare("x1", operand("rsi"), ">", num(60)),
    },
    sizing: { mode: "percent", fixedInr: 100_000, percent: 10, riskPct: 1, atrMult: 2, maxPositions: 10, hedgeOn: false, hedgeSymbolId: 104, hedgeRatio: 1 },
    options: {
      underlyingId: INDEX.NIFTY,
      expiry: "weekly",
      entryTime: "09:20",
      daysToExpiry: 0,
      exitTime: "15:15",
      legs: [
        { id: "l1", action: "SELL", instrument: "CE", strike: "ATM", lots: 1 },
        { id: "l2", action: "SELL", instrument: "PE", strike: "ATM", lots: 1 },
      ],
      stopPerLegPct: 25,
      targetOn: false,
      targetPct: 50,
      adjust: false,
    },
    costs: costsFor("delivery", "RULES"),
    capital: 1_000_000,
    benchmark: "NIFTY 50 TRI",
  }
}

export function lotSize(underlyingId: number): number {
  return getInstrument(underlyingId)?.lot ?? 1
}
