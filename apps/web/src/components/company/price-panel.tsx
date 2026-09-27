"use client"

import { useMemo, useState } from "react"
import { LineChart, type ChartAnnotation, type ScrubPoint } from "@/components/viz/line-chart"
import { useNow } from "@/hooks/use-now"
import { getInstrument } from "@greencircuits/market/catalog"
import { dailyCandles, intradayCandles } from "@greencircuits/market/history"
import { formatDateIST, formatPct, formatPrice, formatSigned, formatTimeIST } from "@greencircuits/market/format"
import { useQuote } from "@/lib/stream/hooks"
import { useDailyBars, useIntradayBars } from "@/lib/data/client"
import { useMarket } from "@/lib/stream/market-context"
import { quoteStore } from "@/lib/stream/store"
import { cn } from "@/lib/utils"

type Range = "1D" | "1M" | "6M" | "1Y" | "5Y"

const RANGES: { id: Range; label: string; sessions: number; phrase: string }[] = [
  { id: "1D", label: "1D", sessions: 0, phrase: "today" },
  { id: "1M", label: "1M", sessions: 22, phrase: "past month" },
  { id: "6M", label: "6M", sessions: 126, phrase: "past six months" },
  { id: "1Y", label: "1Y", sessions: 250, phrase: "past year" },
  { id: "5Y", label: "5Y", sessions: 1250, phrase: "past five years" },
]

/**
 * The headline price and its chart. Scrubbing the chart replaces the big
 * figure with the price at that moment and the change since the range began.
 */
export function PricePanel({ id, defaultRange = "1Y" }: { id: number; defaultRange?: Range }) {
  const inst = getInstrument(id)!
  const q = useQuote(id)
  const { mode, initial } = useMarket()
  const now = useNow(60_000)
  const [range, setRange] = useState<Range>(defaultRange)
  const [scrub, setScrub] = useState<ScrubPoint | null>(null)
  const minute = now?.getTime() ?? null
  const spec = RANGES.find((r) => r.id === range)!
  const intraday = useIntradayBars(id, 5)
  const daily = useDailyBars(id, spec.sessions, range !== "1D")

  const base = useMemo(() => {
    if (minute == null) return null
    // Live: bars from the database. Demo: generated history that ends at the current price.
    if (mode === "live") {
      const bars = range === "1D" ? intraday.data : daily.data
      return bars?.length ? bars.map((c) => ({ t: c.time, v: c.close })) : null
    }
    if (range === "1D") {
      const live = quoteStore.get(id) ?? initial.get(id)
      if (!live) return null
      return intradayCandles(inst, live.open, live.ltp, 5, new Date(minute)).map((c) => ({ t: c.time, v: c.close }))
    }
    return dailyCandles(inst, spec.sessions).map((c) => ({ t: c.time, v: c.close }))
  }, [minute, range, id, inst, initial, mode, spec.sessions, intraday.data, daily.data])

  const points = useMemo(() => {
    if (!base || !q || minute == null) return null
    if (range === "1D") return [...base.slice(0, -1), { t: base.at(-1)!.t, v: q.ltp }]
    return [...base, { t: Math.floor(minute / 1000), v: q.ltp }]
  }, [base, q, range, minute])

  const annotations = useMemo<ChartAnnotation[]>(() => {
    if (!points || range === "1D") return []
    let hi = points[0]!
    let lo = points[0]!
    for (const p of points) {
      if (p.v > hi.v) hi = p
      if (p.v < lo.v) lo = p
    }
    return [
      { t: hi.t, label: `High ₹${formatPrice(hi.v, inst.tick)}` },
      { t: lo.t, label: `Low ₹${formatPrice(lo.v, inst.tick)}` },
    ]
  }, [points, range, inst.tick])

  const start = range === "1D" ? q?.prevClose : points?.[0]?.v
  const shown = scrub?.values[0] ?? q?.ltp
  const change = shown != null && start != null ? shown - start : undefined
  const pct = change != null && start ? (change / start) * 100 : undefined
  const up = (range === "1D" ? q?.changePct : pct) ?? 0
  const when = scrub
    ? range === "1D"
      ? `at ${formatTimeIST(scrub.t * 1000)}`
      : `on ${formatDateIST(scrub.t * 1000, "medium")}`
    : spec.phrase

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p className="figure text-[2.75rem] leading-none md:text-[3.25rem]">
            <span className="mr-1 text-[0.6em] text-ink-2">₹</span>
            {shown != null ? formatPrice(shown, inst.tick) : "–"}
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[0.9375rem]">
            {change != null && pct != null && (
              <span className={cn("num", change > 0 ? "text-up" : change < 0 ? "text-down" : "text-ink-2")}>
                {formatSigned(change, 2)} ({formatPct(pct)})
              </span>
            )}
            <span className="text-ink-3">{when}</span>
          </p>
        </div>
        <div role="tablist" aria-label="Chart range" className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === range}
              onClick={() => {
                setRange(r.id)
                setScrub(null)
              }}
              className={cn(
                "num h-8 rounded-md px-2.5 text-sm transition-colors",
                r.id === range ? "bg-ink text-paper" : "text-ink-2 hover:bg-surface hover:text-ink",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6">
        {points ? (
          <LineChart
            key={range}
            ariaLabel={`${inst.name} price, ${spec.phrase}. Use the arrow keys to read values.`}
            height={340}
            series={[{ id: "price", points, color: up >= 0 ? "var(--up)" : "var(--down)", area: true }]}
            reference={range === "1D" && q ? { value: q.prevClose, label: "Prev close" } : undefined}
            annotations={annotations}
            yFormat={(v) => formatPrice(v, inst.tick >= 1 ? 1 : inst.tick < 0.05 ? inst.tick : 1)}
            onScrub={setScrub}
          />
        ) : (
          <div style={{ height: 340 }} className="border-b border-rule" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
