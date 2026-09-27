"use client"

import { useCallback, useSyncExternalStore } from "react"
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
