"use client"

import { formatNumber } from "@greencircuits/market/format"
import { Figure } from "@/components/editorial/figures"
import { Section } from "@/components/editorial/section"
import { RangeMarker } from "@/components/parts/range-marker"
import { ShareBar } from "@/components/parts/share-bar"
import { Skeleton } from "@/components/ui/skeleton"
import { formatExpiry, formatOi, type LiveChain, type OiUnit } from "./chain-model"
import { CALL, PUT } from "./oi-chart"

const YEAR_MS = 365 * 24 * 3600 * 1000

/**
 * The range the options price in by expiry: one standard deviation either
 * side of the price at the at-the-money volatility, which the price ends
 * inside about two times in three. With the strikes holding the most calls
 * and puts beside it.
 */
export function ExpectedRange({ chain, nowMs, className }: { chain: LiveChain | null; nowMs: number | null; className?: string }) {
  if (!chain || nowMs == null) {
    return (
      <Section title="The range options price in" size="rail" className={className}>
        <Skeleton className="h-24" />
      </Section>
    )
  }
  const sd = (chain.atmIv / 100) * Math.sqrt(Math.max((chain.expiry.getTime() - nowMs) / YEAR_MS, 1 / 365))
  const [lo, hi] = [chain.spot * (1 - sd), chain.spot * (1 + sd)]
  const top = (side: "ce" | "pe") => chain.rows.reduce((a, b) => (b[side].oi > a[side].oi ? b : a)).strike
  return (
    <Section
      title="The range options price in"
      size="rail"
      className={className}
      description="One standard deviation either side of the price, at the at-the-money volatility: the price ends inside it about two times in three. Prices here are modelled, so the range is too."
    >
      <div className="flex items-baseline gap-2">
        <span className="figure text-[1.625rem] leading-none">±{formatNumber(sd * 100, 1)}%</span>
        <span className="text-xs text-ink-3">by {formatExpiry(chain.expiry)}</span>
      </div>
      <RangeMarker
        className="mt-4"
        value={0.5}
        zones={[{ from: 0, to: 1, className: "bg-bench-soft shadow-[inset_0_0_0_1px_var(--bench)]" }]}
        left={formatNumber(lo, 0)}
        right={formatNumber(hi, 0)}
        caption="2 in 3 odds"
        label={`About two in three odds of ending between ${formatNumber(lo, 0)} and ${formatNumber(hi, 0)}`}
      />
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Figure variant="panel" size="sm" label="Most puts at" value={formatNumber(top("pe"), 0)} />
        <Figure variant="panel" size="sm" label="Most calls at" value={formatNumber(top("ce"), 0)} />
      </dl>
    </Section>
  )
}

/** Puts against calls: the ratio on a scale from mostly calls to mostly puts, and the two totals as a bar. */
export function PutCallRatio({ chain, unit, className }: { chain: LiveChain | null; unit: OiUnit; className?: string }) {
  if (!chain) {
    return (
      <Section title="Put-call ratio" size="rail" className={className}>
        <Skeleton className="h-20" />
      </Section>
    )
  }
  const mood = chain.pcr < 0.8 ? "More calls open" : chain.pcr > 1.2 ? "More puts open" : "Balanced"
  return (
    <Section title="Put-call ratio" size="rail" className={className} description="Open interest in puts over calls, across every strike of the expiry. Sample data.">
      <div className="flex items-baseline gap-2">
        <span className="figure text-[1.625rem] leading-none">{formatNumber(chain.pcr, 2)}</span>
        <span className="text-xs text-ink-3">{mood}</span>
      </div>
      <RangeMarker className="mt-4" value={chain.pcr - 0.5} mark={0.5} left="0.5" right="1.5" caption="1: as many puts as calls" label={`Put-call ratio ${formatNumber(chain.pcr, 2)}`} />
      <div className="mt-5" style={{ ["--call" as string]: CALL, ["--put" as string]: PUT }}>
        <ShareBar
          parts={[
            { value: chain.totalCeOi, className: "bg-(--call)" },
            { value: chain.totalPeOi, className: "bg-(--put)" },
          ]}
          label={`Calls ${formatOi(chain.totalCeOi, unit, chain.lot)}, puts ${formatOi(chain.totalPeOi, unit, chain.lot)}`}
        />
        <div className="mt-2 flex justify-between text-xs text-ink-3">
          <span>Calls {formatOi(chain.totalCeOi, unit, chain.lot)}</span>
          <span>Puts {formatOi(chain.totalPeOi, unit, chain.lot)}</span>
        </div>
      </div>
    </Section>
  )
}
