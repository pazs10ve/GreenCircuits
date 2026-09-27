import { EQUITIES, INDEX, getInstrument } from "@greencircuits/market/catalog"
import { fiftyTwoWeek } from "@greencircuits/market/history"
import { upcomingEvents, type MarketEvent } from "@greencircuits/market/reference"
import type { Experiment } from "@greencircuits/market/research/experiments"
import { balancedMix, oversoldDips, sipVsDip } from "@greencircuits/market/research/experiments"
import type { Quote } from "@greencircuits/market/types"
import { apiGet, istNoon } from "./api"

export interface TodayContext {
  ranges: [number, number, number][]
  results: [number, string][]
  events: MarketEvent[]
  experiments: Experiment[]
  source: "api" | "demo"
}

interface ApiToday {
  ranges: [number, number, number][]
  results: [number, string][]
  events: (Omit<MarketEvent, "date"> & { date: string })[]
  experiments: Experiment[]
}

/** Everything the Today page needs besides live quotes: from the API, or the generators in demo mode. */
export async function getTodayContext(): Promise<TodayContext> {
  const api = await apiGet<ApiToday>("/v1/market/today", { revalidate: 60 })
  if (api && api.experiments.length) {
    return { ...api, events: api.events.map((e) => ({ ...e, date: istNoon(e.date) })), source: "api" }
  }
  const nifty = getInstrument(INDEX.NIFTY)!
  const upcoming = upcomingEvents()
  const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" })
  const soon = Date.now() + 8 * 86400000
  return {
    ranges: EQUITIES.map((e) => {
      const r = fiftyTwoWeek(e)
      return [e.id, r.high, r.low]
    }),
    results: upcoming
      .filter((e) => e.kind === "RESULTS" && e.instrumentId != null && e.date.getTime() < soon)
      .map((e) => [e.instrumentId!, weekday.format(e.date)]),
    events: upcoming.slice(0, 6),
    experiments: [sipVsDip(nifty), balancedMix(nifty), oversoldDips(nifty)],
    source: "demo",
  }
}

/** The latest quotes for the first render in live mode; null when the backend isn't reachable. */
export async function getLiveSnapshot(): Promise<Quote[] | null> {
  const res = await apiGet<{ source: string; quotes: Quote[] }>("/v1/quotes/snapshot", { revalidate: false, timeoutMs: 1200 })
  return res && res.source === "SIMULATED" && res.quotes.length ? res.quotes : null
}
