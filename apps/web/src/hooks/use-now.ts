"use client"

import { useCallback, useSyncExternalStore } from "react"

/** The current time, ticking every `intervalMs`. Null during SSR so server and client markup agree. */
export function useNow(intervalMs = 1000): Date | null {
  const subscribe = useCallback(
    (cb: () => void) => {
      const timer = setInterval(cb, intervalMs)
      return () => clearInterval(timer)
    },
    [intervalMs],
  )
  const ms = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => null,
  )
  return ms == null ? null : new Date(ms)
}
