import { EQUITIES, getInstrumentBySlug, INDEX, INDICES } from "@greencircuits/market/catalog"
import { getStrategy } from "@greencircuits/market/lab"
import { addDays, isDateKey, istDateKey, lastWeekday } from "./dates"
import { blankDraft, compare, costsFor, num, operand, raw, type Draft } from "./draft"

/** Starting points shown in the gallery on /lab and prefilled by /lab/new?template=<id>. */
export interface Template {
  id: string
  name: string
  style: "RULES" | "OPTIONS"
  summary: string
  snippet: string
  meta: string
  build: (d: Draft) => Draft
}

export const TEMPLATES: Template[] = [
  {
    id: "golden-cross",
    name: "Golden cross",
    style: "RULES",
    summary: "Buy when the 50-day average crosses above the 200-day; sell on the reverse cross.",
    snippet: "sma(close, 50) crosses_above sma(close, 200)",
    meta: "Daily · NIFTY 100",
    build: (d) => ({
      ...d,
      name: "Golden cross",
      description: "Trend following on large caps: the 50-day SMA crossing the 200-day SMA.",
      universe: { ...d.universe, kind: "index", index: "nifty100" },
      entry: { join: "and", rules: [compare("r1", operand("sma", { period: 50 }), "crosses_above", operand("sma", { period: 200 }))] },
      exit: { ...d.exit, stopOn: true, stopPct: 10, targetOn: false, opposite: true },
      sizing: { ...d.sizing, mode: "equal", maxPositions: 10 },
    }),
  },
  {
    id: "supertrend",
    name: "Supertrend",
    style: "RULES",
    summary: "Ride trends while price holds above a volatility-adjusted trailing line.",
    snippet: "close crosses_above supertrend(10, 3)",
    meta: "Daily · NIFTY 50",
    build: (d) => ({
      ...d,
      name: "Supertrend trend follow",
      description: "Enter when the close flips above Supertrend(10, 3); exit when it flips back below.",
      universe: { ...d.universe, kind: "index", index: "nifty50" },
      entry: { join: "and", rules: [compare("r1", operand("price"), "crosses_above", operand("supertrend"))] },
      exit: { ...d.exit, stopOn: true, stopPct: 8, targetOn: false, opposite: true },
      sizing: { ...d.sizing, mode: "risk", riskPct: 1, atrMult: 2, maxPositions: 8 },
    }),
  },
  {
    id: "opening-range-breakout",
    name: "Opening-range breakout",
    style: "RULES",
    summary: "Buy a break of the first 15-minute high on above-average volume; flat by the close.",
    snippet: "close crosses_above or_high(15) and volume > avg(volume, 20)",
    meta: "15 min · NIFTY 50 members",
    build: (d) => ({
      ...d,
      name: "Opening-range breakout",
      description: "Intraday momentum: a break of the 09:15–09:30 range with volume confirmation.",
      interval: "15m",
      universe: { ...d.universe, kind: "index", index: "nifty50" },
      entry: {
        join: "and",
        rules: [raw("r1", "close crosses_above or_high(15)"), compare("r2", operand("volume", { period: 1 }), ">", operand("volume", { period: 20 }))],
      },
      exit: { ...d.exit, stopOn: true, stopPct: 1, targetOn: true, targetPct: 2, trailOn: false, timeOn: true, maxBars: 20 },
      sizing: { ...d.sizing, mode: "risk", riskPct: 0.5, atrMult: 1.5, maxPositions: 5 },
      costs: costsFor("intraday", "RULES"),
    }),
  },
  {
    id: "pairs-trade",
    name: "Pairs trade",
    style: "RULES",
    summary: "Buy HDFCBANK and short ICICIBANK futures when their price ratio stretches 2σ below its mean.",
    snippet: 'zscore(close / close("ICICIBANK"), 60) < -2',
    meta: "Daily · two private banks",
    build: (d) => ({
      ...d,
      name: "Pairs trade: HDFCBANK / ICICIBANK",
      description: "Mean reversion in the price ratio of two private banks, hedged with a short futures leg.",
      universe: { ...d.universe, kind: "symbol", symbolId: 101 },
      entry: { join: "and", rules: [raw("r1", 'zscore(close / close("ICICIBANK"), 60) < -2')] },
      exit: {
        ...d.exit,
        stopOn: true,
        stopPct: 6,
        targetOn: false,
        timeOn: true,
        maxBars: 30,
        signalOn: true,
        signal: raw("x1", 'zscore(close / close("ICICIBANK"), 60) > 0'),
      },
      sizing: { ...d.sizing, mode: "fixed", fixedInr: 300_000, maxPositions: 1, hedgeOn: true, hedgeSymbolId: 104, hedgeRatio: 1 },
      costs: costsFor("fno", "RULES"),
    }),
  },
  {
    id: "covered-call",
    name: "Covered call",
    style: "OPTIONS",
    summary: "Hold NIFTY futures and sell a monthly out-of-the-money call against them.",
    snippet: "buy 1 × FUT · sell 1 × OTM 2 CE",
    meta: "Monthly expiry · NIFTY",
    build: (d) => ({
      ...d,
      name: "NIFTY covered call",
      description: "Long one lot of NIFTY futures with a monthly OTM call sold against it, rolled at expiry.",
      style: "OPTIONS",
      interval: "15m",
      options: {
        ...d.options,
        underlyingId: INDEX.NIFTY,
        expiry: "monthly",
        entryTime: "09:30",
        daysToExpiry: 20,
        exitTime: "15:15",
        legs: [
          { id: "l1", action: "BUY", instrument: "FUT", strike: "ATM", lots: 1 },
          { id: "l2", action: "SELL", instrument: "CE", strike: "OTM 2", lots: 1 },
        ],
        stopPerLegPct: 100,
        targetOn: true,
        targetPct: 80,
        adjust: true,
      },
      costs: costsFor("fno", "OPTIONS"),
    }),
  },
  {
    id: "short-strangle",
    name: "Short strangle with adjustments",
    style: "OPTIONS",
    summary: "Sell 16-delta calls and puts; roll the untested side when one leg's premium doubles.",
    snippet: "sell 1 × 16Δ CE · sell 1 × 16Δ PE · adjust at 2×",
    meta: "Weekly expiry · NIFTY",
    build: (d) => ({
      ...d,
      name: "Weekly short strangle",
      description: "Premium selling two sessions before the NIFTY weekly expiry, with a defined adjustment rule.",
      style: "OPTIONS",
      interval: "5m",
      options: {
        ...d.options,
        underlyingId: INDEX.NIFTY,
        expiry: "weekly",
        entryTime: "09:30",
        daysToExpiry: 2,
        exitTime: "15:15",
        legs: [
          { id: "l1", action: "SELL", instrument: "CE", strike: "16 delta", lots: 1 },
          { id: "l2", action: "SELL", instrument: "PE", strike: "16 delta", lots: 1 },
        ],
        stopPerLegPct: 100,
        targetOn: true,
        targetPct: 50,
        adjust: true,
      },
      costs: costsFor("fno", "OPTIONS"),
    }),
  },
]

/** Drafts for the sample strategies, so "Edit" on a report opens the rules that produced it. */
const SAMPLE_DRAFTS: Record<string, (d: Draft) => Draft> = {
  "rsi-dip": (d) => ({
    ...d,
    universe: { ...d.universe, kind: "index", index: "nifty200" },
    entry: {
      join: "and",
      rules: [compare("r1", operand("rsi"), "crosses_below", num(30)), compare("r2", operand("price"), ">", operand("sma", { period: 200 }))],
    },
    exit: { ...d.exit, stopOn: true, stopPct: 6, targetOn: true, targetPct: 12, trailOn: true, trailPct: 4, timeOn: true, maxBars: 20, signalOn: true, signal: compare("x1", operand("rsi"), ">", num(60)) },
    sizing: { ...d.sizing, mode: "risk", riskPct: 1, atrMult: 2, maxPositions: 10 },
  }),
  "breakout-52w": (d) => ({
    ...d,
    universe: { ...d.universe, kind: "index", index: "nifty500" },
    entry: { join: "and", rules: [raw("r1", "close > max(high, 250)[1]"), raw("r2", "delivery_pct > avg(delivery_pct, 20) * 1.3")] },
    exit: { ...d.exit, stopOn: false, targetOn: false, trailOn: true, trailPct: 8, signalOn: true, signal: compare("x1", operand("price"), "<", operand("sma", { period: 50 })) },
    sizing: { ...d.sizing, mode: "equal", maxPositions: 15 },
  }),
  "straddle-0920": (d) => ({
    ...d,
    style: "OPTIONS",
    interval: "5m",
    options: { ...d.options, underlyingId: INDEX.NIFTY, expiry: "weekly", entryTime: "09:20", daysToExpiry: 0, exitTime: "15:15", stopPerLegPct: 25, targetOn: false, adjust: false },
    costs: costsFor("fno", "OPTIONS"),
  }),
  "sector-rotation": (d) => ({
    ...d,
    universe: { ...d.universe, kind: "index", index: "sectors" },
    entry: { join: "and", rules: [raw("r1", "rank(return(close, 63)) <= 3"), raw("r2", "is_first_session_of_month")] },
    exit: { ...d.exit, stopOn: false, targetOn: false, signalOn: true, signal: raw("x1", "rank(return(close, 63)) > 3") },
    sizing: { ...d.sizing, mode: "equal", maxPositions: 3 },
  }),
}

export function getTemplate(id: string | undefined): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

export interface DraftSource {
  kind: "blank" | "template" | "strategy" | "symbol" | "screen"
  label?: string
}

/** Resolve the builder's starting draft from the query string. Runs on the server. */
export function initialDraft(
  params: { template?: string; symbol?: string; screen?: string },
  now: Date,
): { draft: Draft; source: DraftSource } {
  const yesterday = lastWeekday(addDays(istDateKey(now), -1))
  const base = blankDraft("2016-01-01", yesterday, "2023-01-01")
  let draft = base
  let source: DraftSource = { kind: "blank" }

  const strategy = params.template ? getStrategy(params.template) : undefined
  const template = getTemplate(params.template)
  if (strategy) {
    draft = SAMPLE_DRAFTS[strategy.id]!({
      ...base,
      templateId: strategy.id,
      name: strategy.name,
      description: strategy.description,
      interval: strategy.interval,
    })
    source = { kind: "strategy", label: `${strategy.name} v${strategy.version}` }
  } else if (template) {
    draft = { ...template.build(base), templateId: template.id }
    source = { kind: "template", label: template.name }
  }

  if (params.symbol) {
    const q = params.symbol.trim()
    const inst =
      getInstrumentBySlug(q) ??
      [...EQUITIES, ...INDICES].find((i) => i.symbol.toLowerCase() === q.toLowerCase())
    if (inst && inst.kind === "EQUITY") {
      draft = { ...draft, style: "RULES", universe: { ...draft.universe, kind: "symbol", symbolId: inst.id } }
      if (!strategy && !template) draft.name = `${inst.symbol} strategy`
      source = source.kind === "blank" ? { kind: "symbol", label: inst.symbol } : source
    } else if (inst && inst.kind === "INDEX" && inst.isFo) {
      draft = { ...draft, options: { ...draft.options, underlyingId: inst.id } }
      source = source.kind === "blank" ? { kind: "symbol", label: inst.symbol } : source
    }
  }

  if (params.screen && params.screen.trim()) {
    draft = { ...draft, style: "RULES", universe: { ...draft.universe, kind: "screen", screen: params.screen.trim().slice(0, 300) } }
    if (!strategy && !template) draft.name = "Screen-based strategy"
    source = source.kind === "blank" ? { kind: "screen", label: "Screener query" } : source
  }

  if (!isDateKey(draft.to)) draft.to = yesterday
  return { draft, source }
}
