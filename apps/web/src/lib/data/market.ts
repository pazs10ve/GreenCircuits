import { cache } from "react"
import type { Dataset, Source } from "@greencircuits/contracts"
import { EQUITIES, INDEX, getInstrument } from "@greencircuits/market/catalog"
import { fiftyTwoWeek } from "@greencircuits/market/history"
import { upcomingEvents, type MarketEvent } from "@greencircuits/market/reference"
import { istDate, isTrading, sessionWhen } from "@greencircuits/market/session"
import type { Experiment } from "@greencircuits/market/research/experiments"
import { balancedMix, oversoldDips, sipVsDip } from "@greencircuits/market/research/experiments"
import type { Quote } from "@greencircuits/market/types"
import { STREAM_URL, apiGet, istNoon } from "./api"

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
  const api = await liveGet<ApiToday>("/v1/market/today", { revalidate: 60 })
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

export interface Feed {
  /** The quotes for the first render in live mode; null in demo mode. */
  quotes: Quote[] | null
  /** What those prices are: simulated, or real and delayed, or closing prices. */
  source: Source
  /** Whether history and company figures are real or samples. */
  dataset: Dataset
  /** When the session on screen ended ("today", "on Friday"); null while it trades. */
  closed: string | null
  /** The IST date of this request (YYYY-MM-DD), so the page and the browser agree on "today". */
  today: string
}

/**
 * What the site shows, decided once per request (the layout and pages share it).
 * Live when the backend answers with quotes: real data is worth showing even
 * with no feed running (its closing prices); the sample database only with the
 * simulator running, since the in-browser demo market is livelier otherwise.
 */
export const getFeed = cache(async (): Promise<Feed> => {
  const now = Date.now()
  const today = istDate(now)
  const demo: Feed = { quotes: null, source: "SIMULATED", dataset: "sample", closed: null, today }
  if (!STREAM_URL) return demo
  const res = await apiGet<{ source: Source; dataset?: Dataset; quotes: Quote[] }>("/v1/quotes/snapshot", { revalidate: false, timeoutMs: 1200 })
  if (!res?.quotes.length) return demo
  const dataset = res.dataset ?? "sample"
  if (dataset === "sample" && res.source !== "SIMULATED") return demo
  const niftyTs = res.quotes.find((q) => q.id === INDEX.NIFTY)?.ts
  const closed = isTrading(res.source, niftyTs, now) ? null : sessionWhen(istDate(niftyTs ?? now), today)
  return { quotes: res.quotes, source: res.source, dataset, closed, today }
})

/**
 * A read from the API for a page in live mode, and null in demo mode. Next's
 * fetch cache keeps the API's last answers after the API stops, and those
 * mustn't sit beside the demo's simulated prices. With the backend up, a slow
 * answer (a cold cache) is worth waiting for: giving up would put the demo's
 * sample figures on a page that says they're real.
 */
export async function liveGet<T>(path: string, options?: Parameters<typeof apiGet>[1]): Promise<T | null> {
  const feed = await getFeed()
  return feed.quotes ? apiGet<T>(path, { timeoutMs: 8000, ...options }) : null
}
