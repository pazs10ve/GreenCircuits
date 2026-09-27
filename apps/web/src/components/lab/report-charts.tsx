"use client"

import { useMemo, useState } from "react"
import type { EquityPoint, RunInfo, RunResult } from "@greencircuits/contracts/lab"
import { LineChart, type ChartSeries, type ScrubPoint } from "@/components/viz/line-chart"
import { niceTicks, timeTicks, type Pt } from "@/components/viz/scales"
import { useElementSize } from "@/hooks/use-element-size"
import { alternativeOf, moneyAxis, money, pct } from "@/lib/lab/describe"
import { cn } from "@/lib/utils"

const dateText = (t: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(t * 1000)

export const epochOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000

function ownLabel(run: RunInfo): string {
  const d = run.definition
  if (d.type === "sip") return d.dip ? "Waiting for dips" : "Your SIP"
  return d.type === "rebalance" ? "The mix" : "The rules"
}

/** What the money was worth: the strategy against its alternative (and, for a SIP, what was put in). */
export function GrowthChart({ run, result }: { run: RunInfo; result: RunResult }) {
  const [scrub, setScrub] = useState<ScrubPoint | null>(null)
  const d = run.definition
  const sample = result.equity_sample
  const other = alternativeOf(result.metrics.alternative.kind, d)

  const series = useMemo<ChartSeries[]>(() => {
    const line = (key: keyof EquityPoint): Pt[] => sample.filter((p) => p[key] != null).map((p) => ({ t: p.t, v: p[key] as number }))
    const out: ChartSeries[] = [
      { id: "v", label: ownLabel(run), points: line("v"), color: "var(--ink)", width: 2 },
      { id: "a", label: other.label, points: line("a"), color: "var(--accent-ink)" },
    ]
    if (d.type === "sip") out.push({ id: "inv", label: "Put in", points: line("inv"), color: "var(--ink-3)", dashed: true, width: 1.25 })
    return out
  }, [sample, run, other.label, d.type])

  const shade = useMemo(() => ({ from: epochOf(result.oos_from), label: "Held out" }), [result.oos_from])
  const last = sample.at(-1)
  const at = scrub ? { t: scrub.t, values: scrub.values } : last ? { t: last.t, values: series.map((s) => s.points.at(-1)?.v) } : null

  return (
    <figure>
      {at && (
        <figcaption className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm" aria-live="off">
          <span className="text-ink-3">{scrub ? dateText(at.t) : `At the end, ${dateText(at.t)}`}</span>
          {series.map((s, i) => (
            <span key={s.id} className="inline-flex items-baseline gap-1.5">
              <span className="text-ink-2">{s.label}</span>
              <span className="num font-semibold" style={{ color: s.color === "var(--ink-3)" ? "var(--ink-2)" : s.color }}>
                {at.values[i] != null ? money(at.values[i]!) : "–"}
              </span>
            </span>
          ))}
        </figcaption>
      )}
      <LineChart
        series={series}
        height={360}
        shade={shade}
        yFormat={moneyAxis}
        endLabels={false}
        onScrub={setScrub}
        ariaLabel={`What the money was worth over the test: ${series.map((s) => `${s.label} ended at ${money(s.points.at(-1)?.v ?? 0)}`).join("; ")}.`}
      />
    </figure>
  )
}

const M = { top: 12, right: 64, bottom: 28 }

/** Falls from the previous peak, as a shaded area hanging from zero. */
export function DrawdownChart({ sample, className }: { sample: EquityPoint[]; className?: string }) {
  const [ref, { width }] = useElementSize<HTMLDivElement>()
  const height = 170
  const geo = useMemo(() => {
    const plotW = Math.max(0, width - M.right)
    if (sample.length < 2 || plotW <= 0) return null
    const t0 = sample[0]!.t
    const t1 = sample.at(-1)!.t
    const lo = Math.min(-0.01, ...sample.map((p) => p.dd)) * 1.08
    const plotH = height - M.top - M.bottom
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * plotW
    const y = (v: number) => M.top + (v / lo) * plotH
    const line = sample.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.dd).toFixed(1)}`).join("")
    const area = `${line}L${x(t1).toFixed(1)},${y(0)}L${x(t0).toFixed(1)},${y(0)}Z`
    const ticks = niceTicks(lo, 0, 3).filter((v) => v <= 0 && v >= lo)
    const xTicks = timeTicks(sample.map((p) => ({ t: p.t, v: p.dd })), Math.max(2, Math.floor(plotW / 110)))
    return { plotW, x, y, line, area, ticks, xTicks }
  }, [sample, width])

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }} role="img" aria-label={`Falls from the previous peak; the deepest was ${pct(Math.min(...sample.map((p) => p.dd)))}.`}>
      {geo && (
        <svg width={width} height={height} className="absolute inset-0 overflow-visible">
          {geo.ticks.map((v) => (
            <g key={v}>
              <line x1={0} x2={geo.plotW} y1={geo.y(v)} y2={geo.y(v)} style={{ stroke: "var(--rule)" }} />
              <text x={geo.plotW + 10} y={geo.y(v) + 4} fontSize={12} className="num" style={{ fill: "var(--ink-3)" }}>
                {v === 0 ? "0%" : pct(v, { digits: 0 })}
              </text>
            </g>
          ))}
          {geo.xTicks.map((tk) => (
            <text key={tk.t} x={geo.x(tk.t)} y={height - 8} fontSize={12} textAnchor="middle" style={{ fill: "var(--ink-3)" }}>
              {tk.label}
            </text>
          ))}
          <path d={geo.area} style={{ fill: "var(--down-soft)" }} />
          <path d={geo.line} fill="none" strokeWidth={1.25} strokeLinejoin="round" style={{ stroke: "var(--down)" }} />
        </svg>
      )}
    </div>
  )
}
