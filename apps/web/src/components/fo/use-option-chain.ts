"use client"

import { useMemo } from "react"
import { expiriesFor, isMonthly } from "@greencircuits/market/chain"
import { INDEX } from "@greencircuits/market/catalog"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { useQuoteReader, useSession } from "@/lib/stream/hooks"
import { useNow } from "@/hooks/use-now"
import {
  expiryKey,
  liveChain,
  oiChain,
  prevCloseLtps,
  previousSessionClose,
  type LiveChain,
} from "./chain-model"

export interface ExpiryOption {
  date: Date
  key: string
  monthly: boolean
}

export interface OptionChainState {
  /** Minute-resolution clock, null until hydrated. */
  nowMs: number | null
  expiries: ExpiryOption[]
  expiry: ExpiryOption | undefined
  chain: LiveChain | null
  quote: Quote | undefined
  vix: number | undefined
}

/**
 * The live chain for one underlying and expiry. Time-dependent pieces are
 * computed on the client only: expiries and OI once a minute, the previous
 * session's option closes once a session, prices on every market tick.
 */
export function useOptionChain(inst: Instrument, selectedKey: string | null): OptionChainState {
  const now = useNow(60_000)
  const read = useQuoteReader(1000)
  const { open } = useSession()
  const nowMs = now?.getTime() ?? null
  const quote = read(inst.id)
  // While the market is shut, price the chain as it closed: options on a screen don't decay over a weekend.
  const pricingMs = nowMs == null ? null : open || quote?.ts == null ? nowMs : Math.min(nowMs, quote.ts)

  const expiries = useMemo<ExpiryOption[]>(() => {
    if (pricingMs == null) return []
    return expiriesFor(inst, new Date(pricingMs)).map((date) => ({ date, key: expiryKey(date), monthly: isMonthly(date, inst) }))
  }, [inst, pricingMs])
  const expiry = expiries.find((e) => e.key === selectedKey) ?? expiries[0]
  const expiryMs = expiry?.date.getTime() ?? null

  // Yesterday's closes anchor the chain: the live quotes' with real prices, the catalog's in the demo.
  const anchor = quote?.prevClose
  const vixQuote = read(INDEX.VIX)
  const vixPrev = vixQuote?.prevClose

  const oi = useMemo(
    () => (expiryMs == null || pricingMs == null ? null : oiChain(inst, new Date(expiryMs), new Date(pricingMs), anchor)),
    [inst, expiryMs, pricingMs, anchor],
  )

  const sessionMs = pricingMs == null ? null : previousSessionClose(new Date(pricingMs)).getTime()
  const prev = useMemo(
    () => (expiryMs == null || sessionMs == null ? null : prevCloseLtps(inst, new Date(expiryMs), new Date(sessionMs), anchor, vixPrev)),
    [inst, expiryMs, sessionMs, anchor, vixPrev],
  )

  const vix = vixQuote?.ltp
  const spot = quote?.ltp
  const chain = useMemo(() => {
    if (spot == null || oi == null || pricingMs == null || expiryMs == null) return null
    return liveChain(inst, spot, new Date(expiryMs), vix, new Date(pricingMs), oi, prev)
  }, [inst, spot, vix, oi, prev, pricingMs, expiryMs])

  return { nowMs, expiries, expiry, chain, quote, vix }
}
