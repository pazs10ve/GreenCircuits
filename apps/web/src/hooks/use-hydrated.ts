"use client"

import { useSyncExternalStore } from "react"

const noop = () => () => {}

/** False during SSR and the hydration pass, true afterwards. Gate browser-only state (localStorage) behind it. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
}
