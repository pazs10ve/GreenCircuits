"use client"

import { useCallback } from "react"
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query"
import type { Candle } from "@greencircuits/market/types"
import { useMarket } from "@/lib/stream/market-context"
import type { Universe, UniverseRow } from "./universe"

/**
 * Bars from the API for client components, in live mode only (demo mode draws
 * from the generators). Requests go to /api/v1/*, which Next proxies to the API.
 */
async function getCandles(path: string): Promise<Candle[]> {
  const res = await fetch(`/api/v1${path}`)
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return ((await res.json()) as { candles: Candle[] }).candles
}

/** The latest session's intraday bars, refreshed every minute. */
export function useIntradayBars(id: number, minutes: 1 | 5 | 15 = 5) {
  const { mode } = useMarket()
  return useQuery({
    queryKey: ["intraday", id, minutes],
    queryFn: () => getCandles(`/instruments/${id}/intraday?minutes=${minutes}`),
    enabled: mode === "live",
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

/** The last `sessions` daily bars. */
export function useDailyBars(id: number, sessions: number, enabled = true) {
  const { mode } = useMarket()
  return useQuery({
    queryKey: ["daily", id, sessions],
    queryFn: () => getCandles(`/instruments/${id}/candles?sessions=${sessions}`),
    enabled: mode === "live" && enabled,
    staleTime: 5 * 60_000,
  })
}

/** Daily bars for several instruments; null until all have arrived (and always in demo mode). */
export function useDailyBarsOf(ids: number[], sessions: number): Map<number, Candle[]> | null {
  const { mode } = useMarket()
  const key = ids.join(",")
  // A stable combine keeps the map's identity until the bars change, so memos downstream hold.
  const combine = useCallback(
    (results: UseQueryResult<Candle[]>[]) =>
      mode === "live" && results.length > 0 && results.every((r) => r.data) ? new Map(key.split(",").map((id, i) => [Number(id), results[i]!.data!])) : null,
    [mode, key],
  )
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ["daily", id, sessions],
      queryFn: () => getCandles(`/instruments/${id}/candles?sessions=${sessions}`),
      enabled: mode === "live",
      staleTime: 5 * 60_000,
    })),
    combine,
  })
}

export interface IndexedUniverse extends Universe {
  byId: Map<number, UniverseRow>
}

const indexed = (u: Universe): IndexedUniverse => ({ ...u, byId: new Map(u.instruments.map((r) => [r.id, r])) })

/** Sparklines, 52-week ranges, history starts, betas and index members from the API, in live mode. */
export function useUniverse() {
  const { mode } = useMarket()
  return useQuery({
    queryKey: ["universe"],
    queryFn: async () => {
      const res = await fetch("/api/v1/market/universe")
      if (!res.ok) throw new Error(`${res.status} /market/universe`)
      return (await res.json()) as Universe
    },
    select: indexed,
    enabled: mode === "live",
    staleTime: 5 * 60_000,
  })
}
