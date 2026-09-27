import { getInstrument, membersOf } from "@greencircuits/market/catalog"
import { formatNumber } from "@greencircuits/market/format"
import { COST_PRESETS, describeCosts, type CostProductId } from "./costs"
import { isDateKey, sessionsBetween, yearsBetween } from "./dates"
import { lotSize, UNIVERSES, type Draft, type Operand, type Rule } from "./draft"

/** Rules text in the engine's expression language: the same shape as lab.ts entry and exit strings. */

function n(v: number): string {
  return Number.isFinite(v) ? String(Math.round(v * 10_000) / 10_000) : "?"
}

export function operandDsl(o: Operand): string {
  switch (o.kind) {
    case "number":
      return n(o.value)
    case "price":
      return o.field
    case "sma":
    case "ema":
    case "rsi":
      return `${o.kind}(close, ${n(o.period)})`
    case "macd":
      return `${o.line === "line" ? "macd" : o.line === "signal" ? "macd_signal" : "macd_hist"}(close, 12, 26, 9)`
    case "bb":
      return `bb_${o.band}(close, ${n(o.period)}, ${n(o.mult)})`
    case "atr":
      return `atr(${n(o.period)})`
    case "volume":
      return o.period <= 1 ? "volume" : `avg(volume, ${n(o.period)})`
    case "vwap":
      return "vwap"
    case "supertrend":
      return `supertrend(${n(o.period)}, ${n(o.mult)})`
  }
}

export function ruleDsl(r: Rule): string {
  if (r.kind === "raw") return r.text.trim() || "…"
  return `${operandDsl(r.left)} ${r.op} ${operandDsl(r.right)}`
}

const OPPOSITE = { ">": "<", "<": ">", crosses_above: "crosses_below", crosses_below: "crosses_above" } as const

export function universeLabel(d: Draft, watchlist?: { name: string; size: number }): string {
  const u = d.universe
  if (d.style === "OPTIONS") {
    const inst = getInstrument(d.options.underlyingId)
    return `${inst?.symbol ?? "?"} ${d.options.expiry} options · lot ${lotSize(d.options.underlyingId)}`
  }
  if (u.kind === "symbol") return `${getInstrument(u.symbolId)?.symbol ?? "?"} · NSE`
  if (u.kind === "watchlist") return watchlist ? `watchlist "${watchlist.name}" · ${watchlist.size} symbols` : "watchlist ?"
  if (u.kind === "screen") return `screen "${u.screen.trim() || "…"}", re-run on each date`
  const idx = UNIVERSES.find((x) => x.id === u.index)
  if (!idx) return "?"
  if (idx.id === "sectors") return idx.label
  return `${idx.label} members, ${u.pointInTime ? "as of each date" : "today's list"}`
}

function exitParts(d: Draft): string[] {
  const e = d.exit
  const parts: string[] = []
  if (e.stopOn) parts.push(`stop ${n(e.stopPct)}%`)
  if (e.targetOn) parts.push(`target ${n(e.targetPct)}%`)
  if (e.trailOn) parts.push(`trail ${n(e.trailPct)}%`)
  if (e.signalOn) parts.push(ruleDsl(e.signal))
  if (e.opposite) {
    const first = d.entry.rules[0]
    parts.push(first && first.kind === "compare" ? `${operandDsl(first.left)} ${OPPOSITE[first.op]} ${operandDsl(first.right)}` : "opposite signal")
  }
  if (e.timeOn) parts.push(`max ${n(e.maxBars)} bars`)
  return parts
}

export function sizingLabel(d: Draft): string {
  const s = d.sizing
  if (d.style === "OPTIONS") {
    const lots = Array.from(new Set(d.options.legs.map((l) => l.lots)))
    return lots.length === 1 ? `${lots[0]} lot${lots[0] === 1 ? "" : "s"} per leg` : "lots set per leg"
  }
  const cap = `max ${n(s.maxPositions)} position${s.maxPositions === 1 ? "" : "s"}`
  const hedge = s.hedgeOn ? ` · hedge short ${getInstrument(s.hedgeSymbolId)?.symbol ?? "?"} futures × ${n(s.hedgeRatio)}` : ""
  if (s.mode === "fixed") return `₹${formatNumber(s.fixedInr, 0)} per trade · ${cap}${hedge}`
  if (s.mode === "percent") return `${n(s.percent)}% of equity per trade · ${cap}${hedge}`
  if (s.mode === "equal") return `Equal weight · ${cap}${hedge}`
  return `${n(s.riskPct)}% risk per trade · stop ${n(s.atrMult)} × atr(14) · ${cap}${hedge}`
}

export function costProduct(d: Draft): CostProductId {
  return d.costs.preset === "fno" ? (d.style === "OPTIONS" ? "options" : "futures") : d.costs.preset
}

/** The full definition as the engine would store it, one clause per line. */
export function toDsl(d: Draft, watchlist?: { name: string; size: number }): string {
  const pad = (k: string) => k.padEnd(9, " ")
  const cont = " ".repeat(10)
  const lines: string[] = [`${pad("strategy")} "${d.name.trim() || "Untitled"}"`, `${pad("style")} ${d.style === "OPTIONS" ? "options" : "rules"}`]
  lines.push(`${pad("universe")} ${universeLabel(d, watchlist)}`)
  lines.push(`${pad("interval")} ${d.interval}`)
  lines.push(`${pad("period")} ${d.from} → ${d.to} · out of sample from ${d.split}`)
  if (d.style === "OPTIONS") {
    const o = d.options
    const when = o.daysToExpiry === 0 ? "is_expiry_day" : `days_to_expiry == ${n(o.daysToExpiry)}`
    lines.push(`${pad("entry")} time == ${o.entryTime} and ${when}`)
    o.legs.forEach((l, i) => {
      const what = l.instrument === "FUT" ? "FUT" : `${l.strike.replace(" delta", "Δ")} ${l.instrument}`
      lines.push(`${i === 0 ? pad("legs") : cont}${l.action.toLowerCase()} ${n(l.lots)} × ${what}`)
    })
    const exit = [`stop ${n(o.stopPerLegPct)}% per leg`]
    if (o.targetOn) exit.push(`target ${n(o.targetPct)}% of credit`)
    exit.push(`exit ${o.exitTime}`)
    lines.push(`${pad("exit")} ${exit.join(" · ")}`)
    if (o.adjust) lines.push(`${pad("adjust")} roll untested leg when a leg's premium doubles`)
  } else {
    const rules = d.entry.rules
    if (rules.length === 0) lines.push(`${pad("entry")} …`)
    rules.forEach((r, i) => lines.push(`${i === 0 ? pad("entry") : `${cont}${d.entry.join} `}${ruleDsl(r)}`))
    const exit = exitParts(d)
    lines.push(`${pad("exit")} ${exit.length ? exit.join(" · ") : "…"}`)
  }
  lines.push(`${pad("sizing")} ${sizingLabel(d)}`)
  const product = costProduct(d)
  lines.push(`${pad("costs")} ${product} · ${describeCosts(COST_PRESETS[product], d.costs.model)}`)
  lines.push(`${pad("capital")} ₹${formatNumber(d.capital, 0)} · benchmark ${d.benchmark}`)
  lines.push(`${pad("fills")} next bar open`)
  return lines.join("\n")
}

export interface Estimate {
  symbols: number
  sessions: number
  bars: number
  seconds: number
  table: string
}

const BARS_PER_SESSION = { "1d": 1, "15m": 25, "5m": 75 } as const

export function estimate(d: Draft, watchlistSize = 0): Estimate {
  const sessions = isDateKey(d.from) && isDateKey(d.to) ? Math.max(0, sessionsBetween(d.from, d.to)) : 0
  let symbols = 1
  if (d.style === "OPTIONS") {
    // About ten strikes either side, calls and puts, on the sessions the legs are open.
    const open = d.options.expiry === "weekly" ? Math.min(5, d.options.daysToExpiry + 1) / 5 : Math.min(22, d.options.daysToExpiry + 1) / 21
    symbols = Math.max(1, Math.round(42 * open))
  } else if (d.universe.kind === "index") symbols = UNIVERSES.find((u) => u.id === d.universe.index)?.members ?? 50
  else if (d.universe.kind === "watchlist") symbols = Math.max(1, watchlistSize)
  else if (d.universe.kind === "screen") symbols = 60
  const bars = sessions * BARS_PER_SESSION[d.interval] * symbols
  const seconds = 0.15 + symbols * 0.02 + bars / 100_000
  return { symbols, sessions, bars, seconds, table: d.interval === "1d" ? "md.candle_1d" : `md.candle_${d.interval}` }
}

export function formatDuration(seconds: number): string {
  if (seconds < 1) return `${formatNumber(seconds, 1)} s`
  if (seconds < 90) return `${formatNumber(Math.round(seconds), 0)} s`
  return `${formatNumber(seconds / 60, 1)} min`
}

/**
 * Which sample report stands in for a draft until the engine runs real
 * backtests: options drafts map to the straddle, sector universes to the
 * rotation, oscillator entries to the RSI dip and everything else to the
 * breakout.
 */
export function closestSample(d: Draft): string {
  if (d.templateId && ["rsi-dip", "breakout-52w", "straddle-0920", "sector-rotation"].includes(d.templateId)) return d.templateId
  if (d.style === "OPTIONS") return "straddle-0920"
  if (d.universe.kind === "index" && d.universe.index === "sectors") return "sector-rotation"
  const text = d.entry.rules.map(ruleDsl).join(" ")
  if (/\b(rsi|zscore|bb_lower)\(/.test(text)) return "rsi-dip"
  return "breakout-52w"
}

/** Symbols the backtest would load for a single-index universe in this demo's catalog, for display. */
export function sampleMembers(indexId: number): string[] {
  return membersOf(indexId).slice(0, 6).map((i) => i.symbol)
}

export { yearsBetween }
