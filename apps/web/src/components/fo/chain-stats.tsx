"use client"

import type { Instrument, Quote } from "@greencircuits/market/types"
import { formatCompact, formatNumber, formatPrice, formatSigned } from "@greencircuits/market/format"
import { Figure, Figures } from "@/components/editorial/figures"
import { Move } from "@/components/parts/move"
import { RangeMarker } from "@/components/parts/range-marker"
import { Tag } from "@/components/parts/tag"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCountdown, formatExpiry, ivPercentile, type LiveChain } from "./chain-model"

/** The expiry's headline numbers, a tile each: the price and its future, how nervous the options are, max pain, and time left. */
export function ChainStats({ inst, chain, quote, vix, nowMs }: { inst: Instrument; chain: LiveChain | null; quote: Quote | undefined; vix: number | undefined; nowMs: number | null }) {
  if (!chain) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-card" />
        ))}
      </div>
    )
  }
  const percentile = ivPercentile(inst, chain.atmIv)
  const left = nowMs == null ? null : chain.expiry.getTime() - nowMs
  return (
    <Figures className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="The expiry in numbers">
      <Figure label={inst.kind === "INDEX" ? inst.name : "Share price"} value={formatPrice(chain.spot, inst.tick)} delta={<Move value={quote?.changePct} />} />
      <Figure label="Future" value={formatPrice(chain.forward, inst.tick)} hint={`${formatSigned(chain.forward - chain.spot, 2)} over the price`} />
      <Figure
        label="Implied volatility"
        value={`${formatNumber(chain.atmIv, 1)}%`}
        hint={inst.kind === "INDEX" && vix != null ? `At the money · India VIX ${formatNumber(vix, 1)}` : "At the money"}
        visual={<RangeMarker value={percentile / 100} left="Low" right="High" caption="for the year" label={`Higher than ${formatNumber(percentile, 0)}% of the past year's readings`} />}
      />
      <Figure label="Max pain" value={formatNumber(chain.maxPain, 0)} hint={`${formatSigned(chain.maxPain - chain.spot, 0)} from the price`} />
      <Figure
        label="Expires in"
        value={left == null ? "–" : formatCountdown(left)}
        delta={left != null && left < 2 * 86_400_000 ? <Tag tone="attn">Soon</Tag> : undefined}
        hint={`${formatExpiry(chain.expiry)} · lots of ${formatNumber(chain.lot, 0)}, ₹${formatCompact(chain.spot * chain.lot)} a lot`}
      />
    </Figures>
  )
}
