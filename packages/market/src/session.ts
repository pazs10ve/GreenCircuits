import type { Quote } from "./types"
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
