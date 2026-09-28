"use client"

import { useMemo } from "react"
import { Eraser, MousePointerClick } from "lucide-react"
import { toast } from "sonner"
import type { Instrument } from "@greencircuits/market/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { LiveChain } from "./chain-model"
import {
  PRESETS,
  buildPreset,
  chartSpots,
  expiryPnl,
  payoffRange,
  strategyMetrics,
  todayPnl,
  type PresetKey,
  type StrategyLeg,
} from "./legs"
import { PayoffChart } from "./payoff-chart"
import { LegsList, PresetPicker } from "./strategy-legs"
import { StrategySummary } from "./strategy-summary"

const YEAR_MS = 365 * 24 * 3600 * 1000

export function StrategyBuilder({
  inst,
  chain,
  nowMs,
  centre,
  legs,
  onLegsChange,
  className,
}: {
  inst: Instrument
  chain: LiveChain | null
  nowMs: number | null
  /** A strike that moves only when the chain view recentres; keeps the chart's x-axis still. */
  centre: number | null
  legs: StrategyLeg[]
  onLegsChange: (legs: StrategyLeg[]) => void
  className?: string
}) {
  const lot = chain?.lot ?? inst.lot ?? 1
  const isIndex = inst.kind === "INDEX"
  const spot = chain?.spot
  const step = chain?.step
  const atmIv = chain?.atmIv
  const anchor = centre ?? chain?.atm
  const firstExpiry = legs.length ? Math.min(...legs.map((l) => l.expiry)) : null

  // Rounded so the axis only moves when the volatility regime does.
  const sd =
    anchor != null && atmIv != null && nowMs != null && firstExpiry != null
      ? anchor * (Math.round(atmIv) / 100) * Math.sqrt(Math.max((firstExpiry - nowMs) / YEAR_MS, 1 / 365))
      : null
  const spotBucket = spot != null && step != null ? Math.round(spot / step) * step : null

  const xs = useMemo(() => {
    if (!legs.length || anchor == null || spotBucket == null || step == null || sd == null) return null
    const strikes = legs.map((l) => l.strike)
    const [lo, hi] = payoffRange(strikes, anchor, spotBucket, step, sd)
    return chartSpots(lo, hi, strikes)
  }, [legs, anchor, spotBucket, step, sd])

  const curve = useMemo(
    () => (xs && nowMs != null ? { expiry: expiryPnl(legs, lot, xs), today: todayPnl(legs, lot, xs, nowMs) } : null),
    [xs, legs, lot, nowMs],
  )

  const metrics = useMemo(
    () =>
      legs.length && spot != null && atmIv != null && nowMs != null
        ? strategyMetrics(legs, { lot, spot, nowMs, atmIv, isIndex })
        : null,
    [legs, lot, spot, atmIv, nowMs, isIndex],
  )

  const loadPreset = (key: PresetKey) => {
    if (!chain) return
    onLegsChange(buildPreset(key, chain))
    toast(`Loaded ${PRESETS.find((p) => p.key === key)!.label.toLowerCase()}`, {
      id: "fo-strategy",
      description: "Entry prices are the current LTPs. Adjust sides and lots below.",
    })
  }

  return (
    <section className={cn("flex scroll-mt-20 flex-col rounded-card border border-rule bg-paper p-4 sm:p-5", className)} aria-labelledby="strategy-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="strategy-title" className="text-sm leading-snug font-semibold">
            Build a strategy
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {legs.length ? `${legs.length} ${legs.length === 1 ? "leg" : "legs"} in ${inst.symbol}, lots of ${lot}.` : "What it pays at expiry, and today."}
          </p>
        </div>
        {legs.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onLegsChange([])}>
            <Eraser /> Clear
          </Button>
        )}
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-5">
        <PresetPicker onPick={loadPreset} disabled={!chain} />
        {legs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-panel bg-panel px-4 py-10 text-center">
            <MousePointerClick className="size-5 text-ink-3" aria-hidden="true" />
            <p className="text-sm font-medium">No legs yet</p>
            <p className="max-w-64 text-sm text-ink-2">Click a price in the chain to buy it, shift-click to sell, or start from a strategy above.</p>
          </div>
        ) : (
          <>
            <LegsList legs={legs} onChange={onLegsChange} />
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <svg width="18" height="6" aria-hidden="true">
                    <line x1="0" x2="18" y1="3" y2="3" stroke="var(--up)" strokeWidth="2" />
                  </svg>
                  At expiry
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <svg width="18" height="6" aria-hidden="true">
                    <line x1="0" x2="18" y1="3" y2="3" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 3" />
                  </svg>
                  Today
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full border-[1.5px] border-ink" aria-hidden="true" />
                  Breakeven
                </span>
              </div>
              {curve && xs && spot != null ? (
                <PayoffChart xs={xs} expiry={curve.expiry} today={curve.today} spot={spot} breakevens={metrics?.breakevens ?? []} />
              ) : (
                <div className="h-[240px]" />
              )}
            </div>
            {metrics && <StrategySummary m={metrics} isIndex={isIndex} />}
          </>
        )}
      </div>
    </section>
  )
}
