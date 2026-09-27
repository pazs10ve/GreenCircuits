"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import type { Source } from "@greencircuits/contracts"
import { INDEX } from "@greencircuits/market/catalog"
import { istDate, isTrading, sessionWhen } from "@greencircuits/market/session"
import type { Quote } from "@greencircuits/market/types"
import { useMarket } from "./market-context"
import { quoteStore } from "./store"

/**
 * Live quote for one instrument. During SSR and hydration it returns the day's
 * snapshot the server rendered with (the same on both sides), then follows the stream.
 */
export function useQuote(id: number | undefined): Quote | undefined {
  const { initial } = useMarket()
  return useSyncExternalStore(
    (cb) => quoteStore.subscribe(id, cb),
    () => (id == null ? undefined : (quoteStore.get(id) ?? initial.get(id))),
    () => (id == null ? undefined : initial.get(id)),
  )
}

/**
 * A counter that advances when any quote changes, at most once per `intervalMs`.
 * For views that aggregate many instruments, where redrawing four times a
 * second would be noise. Zero during SSR and hydration.
 */
export function useMarketTick(intervalMs = 1000): number {
  const subscribe = useCallback(
    (cb: () => void) => {
      let dirty = false
      const unsub = quoteStore.subscribeAll(() => {
        dirty = true
      })
      const timer = setInterval(() => {
        if (dirty) {
          dirty = false
          cb()
        }
      }, intervalMs)
      return () => {
        unsub()
        clearInterval(timer)
      }
    },
    [intervalMs],
  )
  return useSyncExternalStore(subscribe, () => quoteStore.getVersion(), () => 0)
}

/**
 * A quote reader for views that aggregate many instruments (lists, breadth,
 * narratives), refreshed on the market tick. Use it instead of calling
 * quoteStore.get() during render: during SSR and hydration it reads the quotes
 * the server rendered with, so the first client render matches the server HTML.
 */
export function useQuoteReader(intervalMs = 1000): (id: number) => Quote | undefined {
  const { initial } = useMarket()
  const version = useMarketTick(intervalMs)
  return useCallback(
    (id: number) => (version === 0 ? initial.get(id) : (quoteStore.get(id) ?? initial.get(id))),
    [version, initial],
  )
}

/** What the prices on screen are now: the gateway's word once it has spoken, the server's until then. */
export function useSource(): Source {
  const { source } = useMarket()
  return useSyncExternalStore(
    (cb) => quoteStore.subscribeAll(cb),
    () => quoteStore.source ?? source,
    () => source,
  )
}

export interface Session {
  /** Whether the session on screen is still trading. */
  open: boolean
  /** When a finished session ended, in words: "today", "yesterday", "on Friday". Null while it trades. */
  closed: string | null
}

/**
 * Whether the prices on screen are from a session still trading, judged by
 * the feed's source and the Nifty's last trade. The render date comes from
 * the server, so the first render matches on both sides.
 */
export function useSession(): Session {
  const { today } = useMarket()
  const source = useSource()
  const nifty = useQuote(INDEX.NIFTY)
  const ts = nifty?.ts
  return useMemo(() => {
    const now = Date.parse(`${today}T06:30:00Z`)
    if (isTrading(source, ts, now)) return { open: true, closed: null }
    return { open: false, closed: sessionWhen(ts != null ? istDate(ts) : today, today) }
  }, [today, source, ts])
}

export function useStreamStatus(): typeof quoteStore.status {
  return useSyncExternalStore(
    (cb) => quoteStore.subscribeAll(cb),
    () => quoteStore.status,
    () => "idle" as const,
  )
}

/** Quotes for many ids, refreshed on the market tick. Hydration-safe, like useQuoteReader. */
export function useQuotes(ids: number[], intervalMs = 1000): (Quote | undefined)[] {
  const read = useQuoteReader(intervalMs)
  return ids.map((id) => read(id))
}
