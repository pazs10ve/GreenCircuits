"use client"

import { useMemo, useState } from "react"
import type { Point } from "@greencircuits/market/types"
import { formatCompact, formatNumber } from "@greencircuits/market/format"
import { Segmented } from "@/components/market/segmented"
import { Move } from "@/components/parts/move"
import { LineChart } from "@/components/viz/line-chart"

const YEAR = 365.25 * 86400

const RANGES = [
  { value: "1Y", years: 1 },
  { value: "3Y", years: 3 },
  { value: "5Y", years: 5 },
  { value: "10Y", years: 10 },
  { value: "All", years: Infinity },
] as const
type Range = (typeof RANGES)[number]["value"]

/** Points from `start` on, as what ₹10,000 put in at the first of them became. */
function grown(points: Point[], start: number) {
  const from = points.findIndex((p) => p.time >= start)
  if (from < 0) return []
  const base = points[from]!.value
  return points.slice(from).map((p) => ({ t: p.time, v: (10_000 * p.value) / base }))
}

/** What ₹10,000 became in the fund, beside the index it's measured against, over a range. */
export function NavChart({ history, benchmark }: { history: Point[]; benchmark: { name: string; points: Point[] } | null }) {
  const first = history[0]?.time ?? 0
  const last = history.at(-1)?.time ?? 0
  const available = RANGES.filter((r) => r.years === Infinity || last - r.years * YEAR >= first - 7 * 86400)
  const [range, setRange] = useState<Range>(available.some((r) => r.value === "5Y") ? "5Y" : available.at(-1)!.value)
  const years = RANGES.find((r) => r.value === range)!.years
  const start = years === Infinity ? first : last - years * YEAR

  const series = useMemo(() => {
    const fund = grown(history, start)
    const out = [{ id: "fund", points: fund, color: "var(--ink)", label: "This fund", area: true, dashed: false }]
    if (benchmark && fund.length) {
      const index = grown(benchmark.points, fund[0]!.t)
      if (index.length > 1) out.push({ id: "index", points: index, color: "var(--bench)", label: benchmark.name, area: false, dashed: true })
    }
    return out
  }, [history, benchmark, start])
  const end = series[0]!.points.at(-1)?.v

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="figure text-[1.625rem] leading-none">₹{end != null ? formatNumber(end, 0) : "–"}</span>
            {end != null && <Move value={(end / 10_000 - 1) * 100} digits={1} size="md" />}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
            <span>From ₹10,000 {range === "All" ? "at the start" : `${years} year${years === 1 ? "" : "s"} ago`}</span>
            {series[1] && (
              <span className="inline-flex items-center gap-1.5 text-ink-2">
                <span className="h-0.5 w-3 rounded-full bg-bench" aria-hidden="true" />
                {benchmark!.name} ₹{formatNumber(series[1].points.at(-1)!.v, 0)}
              </span>
            )}
          </p>
        </div>
        <Segmented value={range} onChange={setRange} options={available.map((r) => r.value)} aria-label="Range" />
      </div>
      <LineChart series={series} height={300} yFormat={(v) => `₹${formatCompact(v, 1)}`} ariaLabel={`Growth of ₹10,000 in the fund${series[1] ? ` and the ${benchmark!.name}` : ""}`} />
    </div>
  )
}
