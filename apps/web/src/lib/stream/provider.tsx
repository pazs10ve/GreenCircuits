"use client"

import { useEffect, useMemo } from "react"
import { openingQuotes } from "@greencircuits/market/session"
import type { Quote } from "@greencircuits/market/types"
import { connectLive } from "./live"
import { MarketContext, type MarketMode } from "./market-context"
import { quoteStore } from "./store"

let worker: Worker | null = null
let workerSeed: number | null = null

/** Demo mode: run the simulator in a Web Worker from the day's opening snapshot. */
function ensureWorker(seed: number): Worker {
  if (worker && workerSeed === seed) return worker
  worker?.terminate()
  quoteStore.apply([...openingQuotes(seed).values()])
  quoteStore.setStatus("connecting")
  worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" })
  workerSeed = seed
  worker.onmessage = (event: MessageEvent<{ type: string; quotes: Quote[] }>) => {
    // The worker's snapshot equals the opening state already applied; only batches move prices.
    if (event.data.type === "batch") quoteStore.apply(event.data.quotes)
    if (quoteStore.status === "connecting") quoteStore.setStatus("live")
  }
  worker.postMessage({ type: "start", seed, startedAt: Date.now() })
  return worker
}

/**
 * Provides the market mode and the server-rendered quotes to the hooks, and
 * starts the feed: the backend's WebSocket in live mode, the in-browser
 * simulator otherwise.
 */
export function StreamProvider({
  mode,
  seed,
  snapshot,
  streamUrl,
  children,
}: {
  mode: MarketMode
  seed: number
  snapshot?: Quote[]
  streamUrl?: string
  children: React.ReactNode
}) {
  const live = mode === "live" && !!streamUrl && !!snapshot?.length
  const initial = useMemo(() => (live ? new Map(snapshot!.map((q) => [q.id, q])) : openingQuotes(seed)), [live, snapshot, seed])

  useEffect(() => {
    if (live) {
      connectLive(streamUrl!, initial)
      return
    }
    const w = ensureWorker(seed)
    const onVisibility = () => {
      w.postMessage({ type: document.hidden ? "pause" : "resume" })
      quoteStore.setStatus(document.hidden ? "paused" : "live")
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [live, streamUrl, initial, seed])

  const value = useMemo(() => ({ mode: live ? ("live" as const) : ("demo" as const), seed, initial }), [live, seed, initial])
  return <MarketContext value={value}>{children}</MarketContext>
}
