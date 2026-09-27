"use client"

import { useEffect } from "react"
import { useMarket } from "@/lib/stream/market-context"
import { useAlerts } from "./alerts"
import { usePortfolio } from "./portfolio"
import { usePreferences } from "./preferences"
import { startRemoteSync } from "./remote"
import { useWatchlists } from "./watchlists"

/**
 * Persisted stores skip automatic hydration so the first client render matches
 * the server; they load from localStorage here, right after mount. In live
 * mode they then sync with the visitor's account on the server.
 */
export function StoreHydration() {
  const { mode } = useMarket()
  useEffect(() => {
    void (async () => {
      await Promise.all([
        useWatchlists.persist.rehydrate(),
        useAlerts.persist.rehydrate(),
        usePreferences.persist.rehydrate(),
        usePortfolio.persist.rehydrate(),
      ])
      if (mode === "live") await startRemoteSync()
    })()
  }, [mode])
  return null
}
