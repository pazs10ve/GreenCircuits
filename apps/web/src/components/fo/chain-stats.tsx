"use client"

import type { Instrument, Quote } from "@greencircuits/market/types"
import { formatCompact, formatNumber, formatPrice, formatSigned } from "@greencircuits/market/format"
import { Change } from "@/components/market/price"
import { Figure, Figures } from "@/components/editorial/figures"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCountdown, formatExpiry, formatOi, ivPercentile, type LiveChain, type OiUnit } from "./chain-model"

/** One line of headline numbers for the selected expiry. */
export function ChainStats({
  inst,
  chain,
  quote,
  vix,
  nowMs,
  unit,
}: {
  inst: Instrument
  chain: LiveChain | null
  quote: Quote | undefined
  vix: number | undefined
  nowMs: number | null
  unit: OiUnit
}) {
  const unitHint = unit === "lakh" ? "lakh units, all strikes" : "contracts, all strikes"
  const stats: { label: string; value: React.ReactNode; hint: React.ReactNode }[] = chain
    ? [
        {
          label: "Spot",
          value: formatPrice(chain.spot, inst.tick),
          hint: <Change change={quote?.change} pct={quote?.changePct} tick={inst.tick} arrow={false} />,
        },
        {
          label: "Future (synthetic)",
          value: formatPrice(chain.forward, inst.tick),
          hint: `Basis ${formatSigned(chain.forward - chain.spot, 2)}`,
        },
        {
          label: "ATM IV",
          value: `${formatNumber(chain.atmIv, 2)}%`,
          hint: inst.kind === "INDEX" && vix != null ? `India VIX ${formatNumber(vix, 2)}` : `Strike ${formatNumber(chain.atm, 0)}`,
        },
        {
          label: "IV percentile",
          value: formatNumber(ivPercentile(inst, chain.atmIv), 0),
          hint: "sample, past year",
        },
        {
          label: "PCR (OI)",
          value: formatNumber(chain.pcr, 2),
          hint: "put OI ÷ call OI",
        },
        {
          label: "Max pain",
          value: formatNumber(chain.maxPain, 0),
          hint: `${formatSigned(chain.maxPain - chain.spot, 0)} from spot`,
        },
        {
          label: "Expires in",
          value: nowMs == null ? "–" : formatCountdown(chain.expiry.getTime() - nowMs),
          hint: `${formatExpiry(chain.expiry)}, 15:30 IST`,
        },
        {
          label: "Lot size",
          value: formatNumber(chain.lot, 0),
          hint: `Notional ₹${formatCompact(chain.spot * chain.lot)}`,
        },
        { label: "Call OI", value: formatOi(chain.totalCeOi, unit, chain.lot), hint: unitHint },
        { label: "Put OI", value: formatOi(chain.totalPeOi, unit, chain.lot), hint: unitHint },
      ]
    : []

  return (
    <Figures className="grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5" aria-label="The chain in numbers">
      {chain
        ? stats.map((st) => <Figure key={st.label} label={st.label} value={st.value} hint={st.hint} size="sm" />)
        : Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="space-y-2 border-t border-rule pt-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
    </Figures>
  )
}
