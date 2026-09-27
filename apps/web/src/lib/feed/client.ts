"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { DEFAULT_PREFERENCES, type Preferences } from "@greencircuits/contracts/account"
import type { StrategyDefinition } from "@greencircuits/contracts/strategy"
import { buildFeed, interestsOf, type FeedItem, type FeedTest } from "@greencircuits/feed/feed"
import { entrySignals, type SavedRules } from "@greencircuits/feed/signals"
import { getInstrument } from "@greencircuits/market/catalog"
import { fiftyTwoWeek } from "@greencircuits/market/history"
import { upcomingEvents } from "@greencircuits/market/reference"
import { useNow } from "@/hooks/use-now"
import { useMe, useUpdateMe } from "@/lib/account/client"
import { historyOf, useLocalRuns, useLocalRunsReady } from "@/lib/lab/local"
import { useAlerts } from "@/lib/stores/alerts"
import { usePortfolio } from "@/lib/stores/portfolio"
import { usePreferences } from "@/lib/stores/preferences"
import { sessionReady } from "@/lib/stores/remote"
import { useWatchlists } from "@/lib/stores/watchlists"
import { useMarket } from "@/lib/stream/market-context"
import { useQuoteReader } from "@/lib/stream/hooks"

/**
 * The feed, from the API in live mode and built here from this browser's
 * watchlists, holdings, alerts and lab runs in demo mode. Both use
 * @greencircuits/feed, so they say the same things in the same words.
 */

export interface Feed {
  items: FeedItem[]
  /** How many stocks the visitor follows; zero means the feed has nothing to go on yet. */
  following: number
}

const DAY = 86_400_000
const MAX_TEST_UNIVERSE = 10
const idsOf = (d: StrategyDefinition) => (d.type === "rules" ? d.universe : [d.instrumentId])
const istDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

const ranges = new Map<string, { high: number; low: number }>()
function rangeOf(id: number, day: string) {
  const key = `${id}:${day}`
  if (!ranges.has(key)) {
    const inst = getInstrument(id)
    if (inst) ranges.set(key, fiftyTwoWeek(inst))
  }
  return ranges.get(key)
}

function useLocalFeed(enabled: boolean): Feed | undefined {
  const lists = useWatchlists((s) => s.lists)
  const holdings = usePortfolio((s) => s.holdings)
  const alerts = useAlerts((s) => s.alerts)
  const runs = useLocalRuns((s) => s.runs)
  const runsReady = useLocalRunsReady()
  const preferences = usePreferences((s) => s.feed)
  const quote = useQuoteReader(60_000)
  const now = useNow(60_000)

  return useMemo(() => {
    if (!enabled || !now || !runsReady) return undefined
    const t = now.getTime()
    const day = istDate(now)
    const tests = runs.filter((r) => r.run.status === "SUCCEEDED" && r.result)
    const interests = interestsOf({
      holdings: holdings.map((h) => h.instrumentId),
      alerts: alerts.map((a) => a.instrumentId),
      watchlists: lists.flatMap((l) => l.ids),
      lab: tests.flatMap((r) => (idsOf(r.run.definition).length <= MAX_TEST_UNIVERSE ? idsOf(r.run.definition) : [])),
    })
    const saved = new Map<string, SavedRules>()
    for (const r of tests) {
      const d = r.run.definition
      if (d.type === "rules" && !saved.has(r.run.name) && saved.size < 5) saved.set(r.run.name, { name: r.run.name, runId: r.run.id, definition: d })
    }
    const items = buildFeed({
      now: t,
      preferences,
      interests,
      quote,
      range: (id) => rangeOf(id, day),
      holdings: holdings.map((h) => ({ instrumentId: h.instrumentId, qty: h.qty })),
      events: upcomingEvents(now).map((e) => ({ ...e, date: istDate(e.date) })),
      alerts: alerts
        .filter((a) => a.triggeredAt && t - a.triggeredAt.getTime() < DAY)
        .map((a) => ({ id: a.id, instrumentId: a.instrumentId, condition: a.condition, value: a.value, triggeredAt: a.triggeredAt!.getTime(), triggeredPrice: a.triggeredPrice })),
      tests: tests
        .filter((r) => r.run.finished_at && t - Date.parse(r.run.finished_at) < 3 * DAY)
        .map((r): FeedTest => ({ runId: r.run.id, name: r.run.name, finishedAt: Date.parse(r.run.finished_at!), definition: r.run.definition, metrics: r.result!.metrics })),
      signals: entrySignals([...saved.values()], (id) => historyOf(id, now).slice(-300), quote),
    })
    return { items, following: interests.size }
  }, [enabled, now, runsReady, runs, holdings, alerts, lists, preferences, quote])
}

export function useFeed(): { data: Feed | undefined; isPending: boolean } {
  const live = useMarket().mode === "live"
  const query = useQuery({
    queryKey: ["feed"],
    queryFn: async () => {
      await sessionReady()
      const res = await fetch("/api/v1/me/feed", { credentials: "same-origin" })
      if (!res.ok) throw new Error(`feed: ${res.status}`)
      return (await res.json()) as Feed
    },
    enabled: live,
    refetchInterval: 60_000,
  })
  const local = useLocalFeed(!live)
  return live ? { data: query.data, isPending: query.isPending } : { data: local, isPending: !local }
}

/** The feed's tuning: on the account in live mode, in this browser in demo mode. */
export function useFeedPreferences(): { value: Preferences; save: (next: Preferences) => void; saving: boolean } {
  const live = useMarket().mode === "live"
  const { data: me } = useMe()
  const update = useUpdateMe()
  const local = usePreferences((s) => s.feed)
  const setLocal = usePreferences((s) => s.set)
  if (live) return { value: me?.preferences ?? DEFAULT_PREFERENCES, save: (preferences) => update.mutate({ preferences }), saving: update.isPending }
  return { value: local, save: (feed) => setLocal({ feed }), saving: false }
}
