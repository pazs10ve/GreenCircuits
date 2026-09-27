import type { DataSource, Quote } from "./types"
import { hashString } from "./random"
import { createEngine } from "./engine"

/**
 * One simulated market per IST calendar day. The server picks the day's seed
 * and hands it to the browser, so the first render on both sides starts from
 * the same opening state: pages paint real prices, not placeholders, and
 * hydration matches. The Web Worker then evolves the market from there.
 */
export function marketSeed(date = new Date()): number {
  const istDay = new Date(date.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
  return hashString(`greencircuits:${istDay}`)
}

const cache = new Map<number, Map<number, Quote>>()

/** The day's opening snapshot for a seed. Pure and memoised. */
export function openingQuotes(seed: number): Map<number, Quote> {
  let quotes = cache.get(seed)
  if (!quotes) {
    quotes = new Map(createEngine(seed, 0).snapshot().map((q) => [q.id, q]))
    cache.set(seed, quotes)
    if (cache.size > 4) cache.delete(cache.keys().next().value!)
  }
  return quotes
}

/** The IST calendar date of a moment, as YYYY-MM-DD. */
export function istDate(ms: number): string {
  return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * Whether quotes are from a session still trading: the simulator's always
 * are; real prices are while they're stamped today and the feed isn't
 * reporting closing prices.
 */
export function isTrading(source: DataSource, quoteTs: number | undefined, nowMs: number): boolean {
  if (source === "SIMULATED") return true
  if (source === "EOD" || quoteTs == null) return false
  return istDate(quoteTs) === istDate(nowMs)
}

/** When a finished session was, in words: "today", "yesterday", "on Friday" or "on 25 September". */
export function sessionWhen(day: string, today: string): string {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  const format = days < 7 ? { weekday: "long" as const } : { day: "numeric" as const, month: "long" as const }
  return `on ${new Intl.DateTimeFormat("en-IN", { ...format, timeZone: "UTC" }).format(Date.parse(`${day}T00:00:00Z`))}`
}
