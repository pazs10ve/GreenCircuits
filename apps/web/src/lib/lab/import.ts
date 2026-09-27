/**
 * Reads pasted strategy text in the builder's DSL format (see dsl.ts). The API
 * parses it into the validated AST; this is the browser-side check that runs
 * before a draft is created.
 */

export interface ImportResult {
  name?: string
  style?: "RULES" | "OPTIONS"
  fields: Record<string, string>
  errors: string[]
}

const KEYS = ["strategy", "style", "universe", "interval", "period", "entry", "legs", "exit", "adjust", "sizing", "costs", "capital", "fills"]

export function parseStrategyText(text: string): ImportResult {
  const fields: Record<string, string> = {}
  const errors: string[] = []
  let current: string | null = null

  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue
    const indented = /^\s/.test(rawLine)
    const [head = "", ...rest] = rawLine.trim().split(/\s+/)
    const key = head.toLowerCase()
    if (!indented && KEYS.includes(key)) {
      current = key
      fields[key] = rest.join(" ")
    } else if (indented && current) {
      fields[current] = `${fields[current]}\n${rawLine.trim()}`
    } else {
      errors.push(`Unrecognised line: “${rawLine.trim().slice(0, 40)}”`)
    }
  }

  const name = /^"(.+)"$/.exec(fields.strategy?.trim() ?? "")?.[1]
  if (!fields.strategy) errors.unshift("Missing a strategy line, e.g. strategy \"RSI dip\".")
  else if (!name) errors.unshift("Put the strategy name in double quotes.")
  const style = fields.style?.trim().toLowerCase()
  if (style && style !== "rules" && style !== "options") errors.push("Style must be rules or options.")
  if (!fields.entry) errors.push("Missing an entry line.")
  if (!fields.exit) errors.push("Missing an exit line.")
  if (fields.interval && !["1d", "15m", "5m"].includes(fields.interval.trim())) errors.push("Interval must be 1d, 15m or 5m.")
  let depth = 0
  for (const ch of fields.entry ?? "") {
    if (ch === "(") depth++
    if (ch === ")") depth--
  }
  if (depth !== 0) errors.push("Brackets in the entry rules don't match.")

  return { name, style: style === "options" ? "OPTIONS" : style === "rules" ? "RULES" : undefined, fields, errors }
}

export const IMPORT_EXAMPLE = `strategy  "Bollinger mean reversion"
style     rules
universe  NIFTY 100 members, as of each date
interval  1d
period    2016-01-01 → 2026-09-25 · out of sample from 2023-01-01
entry     close crosses_below bb_lower(close, 20, 2)
          and rsi(close, 14) < 35
exit      stop 5% · target 8% · max 15 bars
sizing    10% of equity per trade · max 8 positions
costs     delivery · brokerage ₹0 · stt 0.1% buy+sell · slippage 5 bps
capital   ₹10,00,000 · benchmark NIFTY 50 TRI`
