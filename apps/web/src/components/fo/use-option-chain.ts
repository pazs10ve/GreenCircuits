"use client"

import { useMemo } from "react"
import { expiriesFor, isMonthly } from "@greencircuits/market/chain"
import { INDEX } from "@greencircuits/market/catalog"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { useQuoteReader } from "@/lib/stream/hooks"
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
  const nowMs = now?.getTime() ?? null

  const expiries = useMemo<ExpiryOption[]>(() => {
    if (nowMs == null) return []
    return expiriesFor(inst, new Date(nowMs)).map((date) => ({ date, key: expiryKey(date), monthly: isMonthly(date, inst) }))
  }, [inst, nowMs])
  const expiry = expiries.find((e) => e.key === selectedKey) ?? expiries[0]
  const expiryMs = expiry?.date.getTime() ?? null

  const oi = useMemo(
    () => (expiryMs == null || nowMs == null ? null : oiChain(inst, new Date(expiryMs), new Date(nowMs))),
    [inst, expiryMs, nowMs],
  )

  const sessionMs = nowMs == null ? null : previousSessionClose(new Date(nowMs)).getTime()
  const prev = useMemo(
    () => (expiryMs == null || sessionMs == null ? null : prevCloseLtps(inst, new Date(expiryMs), new Date(sessionMs))),
    [inst, expiryMs, sessionMs],
  )

  const quote = read(inst.id)
  const vix = read(INDEX.VIX)?.ltp
  const spot = quote?.ltp
  const chain = useMemo(() => {
    if (spot == null || oi == null || nowMs == null || expiryMs == null) return null
    return liveChain(inst, spot, new Date(expiryMs), vix, new Date(nowMs), oi, prev)
  }, [inst, spot, vix, oi, prev, nowMs, expiryMs])

  return { nowMs, expiries, expiry, chain, quote, vix }
}
