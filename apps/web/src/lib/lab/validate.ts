import { getInstrument } from "@greencircuits/market/catalog"
import { formatINR } from "@greencircuits/market/format"
import { isDateKey, yearsBetween } from "./dates"
import { WEEKLY_UNDERLYINGS, type Draft, type Operand, type Rule } from "./draft"
import { costProduct, operandDsl } from "./dsl"

export interface Check {
  /** Section the message belongs to, for grouping and scrolling. */
  section: "basics" | "universe" | "period" | "entry" | "exit" | "sizing" | "costs" | "capital"
  message: string
}

export interface Validation {
  errors: Check[]
  warnings: Check[]
  passes: string[]
}

const EARLIEST = "2016-01-01"

function badPeriod(o: Operand): boolean {
  if (o.kind === "number") return !Number.isFinite(o.value)
  if (["sma", "ema", "rsi", "bb", "atr", "supertrend"].includes(o.kind)) return !Number.isInteger(o.period) || o.period < 2 || o.period > 500
  if (o.kind === "volume") return !Number.isInteger(o.period) || o.period < 1 || o.period > 500
  if ((o.kind === "bb" || o.kind === "supertrend") && !(o.mult > 0 && o.mult <= 10)) return true
  return false
}

function balanced(text: string): boolean {
  let depth = 0
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++
    if (ch === ")" || ch === "]") depth--
    if (depth < 0) return false
  }
  return depth === 0
}

function checkRule(r: Rule, where: string, section: Check["section"], errors: Check[]) {
  if (r.kind === "raw") {
    if (!r.text.trim()) errors.push({ section, message: `${where}: the custom condition is empty.` })
    else if (!balanced(r.text)) errors.push({ section, message: `${where}: brackets in the custom condition don't match.` })
    return
  }
  if (r.left.kind === "number") errors.push({ section, message: `${where}: start with an indicator, not a number.` })
  if (badPeriod(r.left) || badPeriod(r.right)) errors.push({ section, message: `${where}: periods must be whole numbers from 2 to 500.` })
  if (r.left.kind !== "number" && operandDsl(r.left) === operandDsl(r.right)) errors.push({ section, message: `${where}: compares ${operandDsl(r.left)} with itself.` })
}

/** Everything the API would reject, plus the warnings the blueprint's guardrails call for. */
export function validate(d: Draft, today: string, watchlist?: { size: number }): Validation {
  const errors: Check[] = []
  const warnings: Check[] = []
  const passes: string[] = []

  if (!d.name.trim()) errors.push({ section: "basics", message: "Give the strategy a name." })
  else if (d.name.trim().length > 60) errors.push({ section: "basics", message: "Keep the name under 60 characters." })

  // Universe
  if (d.style === "RULES") {
    const u = d.universe
    if (u.kind === "symbol" && !getInstrument(u.symbolId)) errors.push({ section: "universe", message: "Pick a symbol to trade." })
    if (u.kind === "screen" && !u.screen.trim()) errors.push({ section: "universe", message: "Enter a screener query, e.g. roe > 15 and pe < 25." })
    if (u.kind === "watchlist" && !watchlist?.size) errors.push({ section: "universe", message: "The chosen watchlist is empty." })
    if (u.kind === "index" && u.index !== "sectors" && !u.pointInTime)
      warnings.push({ section: "universe", message: "Today's index list leaves out stocks that were dropped or delisted, so results carry survivorship bias." })
    if (u.kind === "symbol") warnings.push({ section: "universe", message: "One symbol rarely yields 30 trades; results with fewer are flagged as unreliable." })
  } else {
    const o = d.options
    if (o.expiry === "weekly" && !WEEKLY_UNDERLYINGS.includes(o.underlyingId))
      errors.push({ section: "universe", message: `${getInstrument(o.underlyingId)?.symbol} has monthly expiries only since SEBI's November 2024 changes. Choose monthly.` })
  }

  // Period
  const datesOk = [d.from, d.to, d.split].every(isDateKey)
  if (!datesOk) errors.push({ section: "period", message: "Enter valid from, to and split dates." })
  else {
    if (d.from < EARLIEST) errors.push({ section: "period", message: "Sample history starts on 1 Jan 2016." })
    if (d.to > today) errors.push({ section: "period", message: "The test can't run past yesterday's close." })
    if (d.from >= d.to) errors.push({ section: "period", message: "The start date must come before the end date." })
    else if (!(d.split > d.from && d.split < d.to)) errors.push({ section: "period", message: "The out-of-sample split must fall between the start and end dates." })
    else {
      if (yearsBetween(d.from, d.split) < 3) warnings.push({ section: "period", message: "In-sample period is under 3 years; the rules may fit one market regime." })
      if (yearsBetween(d.split, d.to) < 1) warnings.push({ section: "period", message: "Out-of-sample period is under a year: too short to confirm the edge." })
      else passes.push(`Out-of-sample window reserved from ${d.split}`)
    }
  }

  // Entry and exit
  if (d.style === "RULES") {
    if (d.entry.rules.length === 0) errors.push({ section: "entry", message: "Add at least one entry rule." })
    d.entry.rules.forEach((r, i) => checkRule(r, `Entry rule ${i + 1}`, "entry", errors))
    const usesVwap = d.entry.rules.some((r) => r.kind === "compare" && (r.left.kind === "vwap" || r.right.kind === "vwap"))
    if (usesVwap && d.interval === "1d") warnings.push({ section: "entry", message: "VWAP resets every session; on daily bars it is just the day's average price." })

    const e = d.exit
    if (e.stopOn && !(e.stopPct > 0 && e.stopPct < 100)) errors.push({ section: "exit", message: "Stop-loss must be between 0% and 100%." })
    if (e.targetOn && !(e.targetPct > 0 && e.targetPct <= 1000)) errors.push({ section: "exit", message: "Target must be above 0%." })
    if (e.trailOn && !(e.trailPct > 0 && e.trailPct < 100)) errors.push({ section: "exit", message: "Trailing stop must be between 0% and 100%." })
    if (e.timeOn && !(Number.isInteger(e.maxBars) && e.maxBars >= 1 && e.maxBars <= 5000)) errors.push({ section: "exit", message: "Time exit needs a whole number of bars." })
    if (e.signalOn) checkRule(e.signal, "Exit signal", "exit", errors)
    if (!e.stopOn && !e.targetOn && !e.trailOn && !e.timeOn && !e.opposite && !e.signalOn) errors.push({ section: "exit", message: "Add at least one way to exit a trade." })
    if (!e.stopOn && !e.trailOn) warnings.push({ section: "exit", message: "No stop-loss: one bad trade can take a full position." })
    if (e.stopOn && e.targetOn && e.targetPct < e.stopPct) warnings.push({ section: "exit", message: "The target is closer than the stop, so each winner earns less than a loser costs." })

    const s = d.sizing
    if (s.mode === "fixed" && !(s.fixedInr > 0 && s.fixedInr <= d.capital)) errors.push({ section: "sizing", message: "Fixed size must be above ₹0 and within capital." })
    if (s.mode === "percent" && !(s.percent > 0 && s.percent <= 100)) errors.push({ section: "sizing", message: "Percent of equity must be between 0% and 100%." })
    if (s.mode === "risk" && !(s.riskPct > 0 && s.riskPct <= 5)) errors.push({ section: "sizing", message: "Risk per trade must be above 0% and at most 5%." })
    if (s.mode === "risk" && !(s.atrMult > 0 && s.atrMult <= 10)) errors.push({ section: "sizing", message: "ATR multiple must be between 0 and 10." })
    if (!(Number.isInteger(s.maxPositions) && s.maxPositions >= 1 && s.maxPositions <= 50)) errors.push({ section: "sizing", message: "Max positions must be a whole number from 1 to 50." })
    if (s.mode === "percent" && s.percent * s.maxPositions > 100 && costProduct(d) === "delivery")
      errors.push({ section: "sizing", message: `${s.percent}% × ${s.maxPositions} positions is over 100% of equity; delivery trades can't use leverage.` })
    if (s.hedgeOn && !(s.hedgeRatio > 0 && s.hedgeRatio <= 5)) errors.push({ section: "sizing", message: "Hedge ratio must be between 0 and 5." })
  } else {
    const o = d.options
    if (o.legs.length === 0) errors.push({ section: "entry", message: "Add at least one leg." })
    if (o.legs.some((l) => !(Number.isInteger(l.lots) && l.lots >= 1 && l.lots <= 50))) errors.push({ section: "entry", message: "Each leg needs 1 to 50 lots." })
    if (!(o.entryTime >= "09:15" && o.entryTime <= "15:29")) errors.push({ section: "entry", message: "Entry time must fall inside the NSE session, 09:15–15:30." })
    if (!(o.exitTime > o.entryTime && o.exitTime <= "15:30")) errors.push({ section: "exit", message: "Exit time must come after the entry and by 15:30." })
    const maxDays = o.expiry === "weekly" ? 4 : 22
    if (!(Number.isInteger(o.daysToExpiry) && o.daysToExpiry >= 0 && o.daysToExpiry <= maxDays)) errors.push({ section: "entry", message: `Days to expiry must be 0 to ${maxDays} for ${o.expiry} options.` })
    if (!(o.stopPerLegPct > 0 && o.stopPerLegPct <= 500)) errors.push({ section: "exit", message: "Stop per leg must be above 0%." })
    if (d.interval === "1d") errors.push({ section: "period", message: "Options strategies need 5m or 15m bars to time entries and exits." })
    if (o.legs.some((l) => l.action === "SELL" && l.instrument !== "FUT") && o.stopPerLegPct >= 200)
      warnings.push({ section: "exit", message: "Short options with a wide stop carry large tail risk on gap days." })
  }

  // Costs and capital
  const m = d.costs.model
  if (Object.values(m).some((v) => !(Number.isFinite(v) && v >= 0))) errors.push({ section: "costs", message: "Cost fields can't be negative or empty." })
  else {
    passes.push("Brokerage, STT, stamp duty, exchange, SEBI and GST included")
    if (m.slippageBps === 0) warnings.push({ section: "costs", message: "Zero slippage is optimistic; 3–10 bps is typical for liquid large caps." })
  }
  const product = costProduct(d)
  if (d.style === "RULES" && d.interval !== "1d" && product === "delivery")
    warnings.push({ section: "costs", message: "Delivery costs on intraday bars: use the Intraday preset if positions close the same day." })
  if (d.style === "RULES" && d.interval === "1d" && product === "intraday")
    warnings.push({ section: "costs", message: "Intraday costs on daily bars: positions held overnight pay delivery STT." })
  if (!(d.capital >= 10_000 && d.capital <= 1_000_000_000)) errors.push({ section: "capital", message: `Capital must be between ${formatINR(10_000, 0)} and ${formatINR(1_000_000_000, 0)}.` })

  passes.unshift("Signals on the bar close, fills at the next bar's open")
  if (d.style === "RULES" && d.universe.kind === "index" && d.universe.pointInTime) passes.push("Point-in-time index membership")
  return { errors, warnings, passes }
}
