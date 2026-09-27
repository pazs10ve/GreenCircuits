"use client"

import { useQuery } from "@tanstack/react-query"
import type { Candle } from "@greencircuits/market/types"
import { useMarket } from "@/lib/stream/market-context"

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
