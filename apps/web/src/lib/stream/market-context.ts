"use client"

import { createContext, useContext } from "react"
import type { Quote } from "@greencircuits/market/types"

/**
 * "live": quotes stream from the backend (ingestor → Valkey → gateway) and pages read the API.
 * "demo": no backend is reachable, so the simulator runs in a Web Worker and pages use the generators.
 */
export type MarketMode = "live" | "demo"

export interface MarketContextValue {
  mode: MarketMode
  /** The demo simulator's seed for today. */
  seed: number
  /** The quotes the server rendered with; hooks return these during SSR and hydration. */
  initial: Map<number, Quote>
}

export const MarketContext = createContext<MarketContextValue>({ mode: "demo", seed: 0, initial: new Map() })

export function useMarket(): MarketContextValue {
  return useContext(MarketContext)
}
