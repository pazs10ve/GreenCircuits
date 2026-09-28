"use client"

import { useMemo, useState } from "react"
import type { Point } from "@greencircuits/market/types"
import { DrawdownChart } from "@/components/lab/report-charts"
import { LineChart, type ChartSeries, type ScrubPoint } from "@/components/viz/line-chart"
import { money, moneyAxis } from "@/lib/lab/describe"

const dateText = (t: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(t * 1000)

/**
 * What the holdings would have been worth over the last year against the
 * same money in the Nifty 50, drawn like the lab's results, with the falls
 * from each peak underneath. Scrubbing reads both values off any day.
 */
export function HoldingsChart({ equity, benchmark, drawdown }: { equity: Point[]; benchmark: Point[]; drawdown: Point[] }) {
  const [scrub, setScrub] = useState<ScrubPoint | null>(null)
  const series = useMemo<ChartSeries[]>(
    () => [
      { id: "you", label: "Your holdings", points: equity.map((p) => ({ t: p.time, v: p.value })), color: "var(--ink)", width: 2, area: true },
      { id: "nifty", label: "Nifty 50", points: benchmark.map((p) => ({ t: p.time, v: p.value })), color: "var(--bench)", dashed: true },
    ],
    [equity, benchmark],
  )
  // The drawdown comes in percent; the lab's chart reads fractions.
  const falls = useMemo(() => drawdown.map((p) => ({ t: p.time, dd: p.value / 100 })), [drawdown])
  const at = scrub ?? { t: equity.at(-1)?.time ?? 0, values: series.map((s) => s.points.at(-1)?.v) }

  return (
    <figure>
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
        <span className="text-ink-3">{scrub ? dateText(at.t) : "Now"}</span>
        {series.map((s, i) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span className={s.id === "nifty" ? "h-0.5 w-3 rounded-full bg-bench" : "h-0.5 w-3 rounded-full bg-ink"} aria-hidden="true" />
            <span className="text-ink-2">{s.label}</span>
            <span className="num font-semibold text-ink">
              {at.values[i] != null ? money(at.values[i]!) : "–"}
            </span>
          </span>
        ))}
      </figcaption>
      <LineChart
        series={series}
        height={280}
        yFormat={moneyAxis}
        endLabels={false}
        onScrub={setScrub}
        ariaLabel={`Your holdings over the last year, ending at ${money(series[0]!.points.at(-1)?.v ?? 0)}, against the same money in the Nifty 50, ending at ${money(series[1]!.points.at(-1)?.v ?? 0)}.`}
      />
      <p className="mt-5 mb-1 text-xs text-ink-3">Falls from the previous peak</p>
      <DrawdownChart sample={falls} />
    </figure>
  )
}
