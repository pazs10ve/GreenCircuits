"use client"

import { memo, useCallback, useMemo, useState } from "react"
import { useElementSize } from "@/hooks/use-element-size"
import { cn } from "@/lib/utils"
import { downsample, linePath, nearestIndex, niceTicks, timeTicks, type Pt } from "./scales"

export interface ChartSeries {
  id: string
  points: Pt[]
  /** A CSS colour, e.g. "var(--ink)". */
  color: string
  width?: number
  dashed?: boolean
  /** Written at the end of the line instead of a legend. */
  label?: string
  /** Faint fill under the line. */
  area?: boolean
}

export interface ChartAnnotation {
  t: number
  label: string
}

/** A shaded stretch from `from` to the end of the chart, e.g. a held-out period. */
export interface ChartShade {
  from: number
  label: string
}

export interface ScrubPoint {
  t: number
  values: (number | undefined)[]
}

const M = { top: 18, right: 64, bottom: 28, left: 0 }

interface Geo {
  x: (t: number) => number
  y: (v: number) => number
  yTicks: number[]
  xTicks: { t: number; label: string }[]
  paths: { id: string; line: string; area: string | null; end: { x: number; y: number } }[]
}

/**
 * Editorial line chart: hairline grid, labels on the lines, annotations, a
 * dotted reference line, and scrubbing. Hovering (or arrow keys) reports the
 * point under the cursor through `onScrub`, so the page's headline figure can
 * show it, the way Apple Stocks does.
 */
export function LineChart({
  series,
  height = 320,
  reference,
  annotations = [],
  shade,
  yFormat = (v) => v.toLocaleString("en-IN"),
  onScrub,
  className,
  ariaLabel,
  endLabels = true,
}: {
  series: ChartSeries[]
  height?: number
  reference?: { value: number; label: string }
  annotations?: ChartAnnotation[]
  shade?: ChartShade
  yFormat?: (v: number) => string
  onScrub?: (point: ScrubPoint | null) => void
  className?: string
  ariaLabel: string
  endLabels?: boolean
}) {
  const [ref, { width }] = useElementSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const main = series[0]
  const plotW = Math.max(0, width - M.left - M.right)
  const plotH = height - M.top - M.bottom

  const geo = useMemo<Geo | null>(() => {
    if (!main || main.points.length < 2 || plotW <= 0) return null
    const t0 = main.points[0]!.t
    const t1 = main.points.at(-1)!.t
    let lo = Infinity
    let hi = -Infinity
    for (const s of series) for (const p of s.points) {
      if (p.v < lo) lo = p.v
      if (p.v > hi) hi = p.v
    }
    if (reference) {
      lo = Math.min(lo, reference.value)
      hi = Math.max(hi, reference.value)
    }
    const pad = Math.max((hi - lo) * 0.08, Math.abs(hi) * 0.001)
    lo -= pad
    hi += pad
    const x = (t: number) => M.left + ((t - t0) / Math.max(1, t1 - t0)) * plotW
    const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * plotH
    const yTicks = niceTicks(lo, hi, height > 240 ? 4 : 3).filter((v) => v >= lo && v <= hi)
    const xTicks = timeTicks(main.points, Math.max(2, Math.floor(plotW / 110)))
    const paths = series.map((s) => {
      const pts = downsample(s.points, Math.round(plotW))
      const line = linePath(pts, x, y)
      const area = s.area && pts.length ? `${line}L${x(pts.at(-1)!.t).toFixed(1)},${(M.top + plotH).toFixed(1)}L${x(pts[0]!.t).toFixed(1)},${(M.top + plotH).toFixed(1)}Z` : null
      const last = s.points.at(-1)!
      return { id: s.id, line, area, end: { x: x(last.t), y: y(last.v) } }
    })
    return { x, y, yTicks, xTicks, paths }
  }, [series, main, plotW, plotH, reference, height])

  // Nudge end labels apart when lines finish close together.
  const labels = useMemo(() => {
    if (!geo || !endLabels) return []
    const items = series
      .map((s, i) => ({ s, y: geo.paths[i]!.end.y, x: geo.paths[i]!.end.x }))
      .filter((it) => it.s.label)
      .sort((a, b) => a.y - b.y)
    for (let i = 1; i < items.length; i++) {
      if (items[i]!.y - items[i - 1]!.y < 14) items[i]!.y = items[i - 1]!.y + 14
    }
    return items
  }, [geo, series, endLabels])

  const scrubTo = useCallback(
    (i: number | null) => {
      setHover(i)
      if (!onScrub || !main) return
      if (i == null) return onScrub(null)
      const t = main.points[i]!.t
      onScrub({ t, values: series.map((s) => (s.points.length ? s.points[nearestIndex(s.points, t)]!.v : undefined)) })
    },
    [onScrub, main, series],
  )

  const onPointer = (e: React.PointerEvent<SVGRectElement>) => {
    if (!geo || !main) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const t0 = main.points[0]!.t
    const t1 = main.points.at(-1)!.t
    const t = t0 + (px / Math.max(1, rect.width)) * (t1 - t0)
    scrubTo(nearestIndex(main.points, t))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!main) return
    const n = main.points.length
    const step = e.shiftKey ? Math.max(1, Math.round(n / 20)) : 1
    if (e.key === "ArrowLeft") scrubTo(Math.max(0, (hover ?? n - 1) - step))
    else if (e.key === "ArrowRight") scrubTo(Math.min(n - 1, (hover ?? n - 1) + step))
    else if (e.key === "Escape") scrubTo(null)
    else return
    e.preventDefault()
  }

  const hovered = hover != null && main && geo ? main.points[hover] : null

  return (
    <div
      ref={ref}
      className={cn("relative w-full touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/30", className)}
      style={{ height }}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      onBlur={() => scrubTo(null)}
    >
      {geo && (
        <svg width={width} height={height} className="absolute inset-0 overflow-visible">
          <StaticLayer geo={geo} series={series} plotW={plotW} plotH={plotH} height={height} yFormat={yFormat} reference={reference} annotations={annotations} shade={shade} />
          {labels.map((l) => (
            <text key={l.s.id} x={l.x + 8} y={l.y + 4} fontSize={12} fontWeight={500} style={{ fill: l.s.color }}>
              {l.s.label}
            </text>
          ))}
          {!hovered &&
            geo.paths.slice(0, 1).map((p) => (
              <circle key={p.id} cx={p.end.x} cy={p.end.y} r={3} style={{ fill: main!.color }} />
            ))}
          {hovered && (
            <g pointerEvents="none">
              <line x1={geo.x(hovered.t)} x2={geo.x(hovered.t)} y1={M.top - 6} y2={M.top + plotH} style={{ stroke: "var(--ink-3)" }} strokeWidth={1} />
              {series.map((s) => {
                if (!s.points.length) return null
                const p = s.points[nearestIndex(s.points, hovered.t)]!
                return <circle key={s.id} cx={geo.x(p.t)} cy={geo.y(p.v)} r={4} strokeWidth={2} style={{ fill: s.color, stroke: "var(--paper)" }} />
              })}
            </g>
          )}
          <rect
            x={M.left}
            y={0}
            width={plotW}
            height={height - M.bottom}
            fill="transparent"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => scrubTo(null)}
          />
        </svg>
      )}
    </div>
  )
}

/** Grid, axes, lines and annotations: everything that doesn't change while scrubbing. */
const StaticLayer = memo(function StaticLayer({
  geo,
  series,
  plotW,
  plotH,
  height,
  yFormat,
  reference,
  annotations,
  shade,
}: {
  geo: Geo
  series: ChartSeries[]
  plotW: number
  plotH: number
  height: number
  yFormat: (v: number) => string
  reference?: { value: number; label: string }
  annotations: ChartAnnotation[]
  shade?: ChartShade
}) {
  const right = M.left + plotW
  const main = series[0]!
  const shadeX = shade ? Math.min(right, Math.max(M.left, geo.x(shade.from))) : null
  return (
    <g>
      {shade && shadeX != null && shadeX < right && (
        <g>
          <rect x={shadeX} y={M.top - 6} width={right - shadeX} height={plotH + 6} style={{ fill: "var(--surface)" }} />
          <line x1={shadeX} x2={shadeX} y1={M.top - 6} y2={M.top + plotH} strokeDasharray="2 3" style={{ stroke: "var(--ink-3)" }} strokeWidth={1} />
          <text x={shadeX + 6} y={M.top + 6} fontSize={11.5} style={{ fill: "var(--ink-2)" }}>
            {shade.label}
          </text>
        </g>
      )}
      {geo.yTicks
        .filter((v) => !reference || Math.abs(geo.y(v) - geo.y(reference.value)) > 16)
        .map((v) => (
        <g key={v}>
          <line x1={M.left} x2={right} y1={geo.y(v)} y2={geo.y(v)} style={{ stroke: "var(--rule)" }} strokeWidth={1} />
          <text x={right + 10} y={geo.y(v) + 4} fontSize={12} className="num" style={{ fill: "var(--ink-3)" }}>
            {yFormat(v)}
          </text>
        </g>
      ))}
      {geo.xTicks.map((tk) => (
        <text key={tk.t} x={geo.x(tk.t)} y={height - 8} fontSize={12} textAnchor="middle" style={{ fill: "var(--ink-3)" }}>
          {tk.label}
        </text>
      ))}
      {reference && (
        <g>
          <line
            x1={M.left}
            x2={right}
            y1={geo.y(reference.value)}
            y2={geo.y(reference.value)}
            strokeDasharray="2 4"
            strokeLinecap="round"
            strokeWidth={1.2}
            style={{ stroke: "var(--ink-3)" }}
          />
          <text x={right + 10} y={geo.y(reference.value) + 4} fontSize={11} style={{ fill: "var(--ink-2)" }}>
            {reference.label}
          </text>
        </g>
      )}
      {series.map((s, i) => {
        const p = geo.paths[i]!
        return (
          <g key={s.id}>
            {p.area && <path d={p.area} style={{ fill: s.color }} opacity={0.06} />}
            <path
              d={p.line}
              fill="none"
              strokeWidth={s.width ?? (i === 0 ? 1.75 : 1.5)}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "4 3" : undefined}
              style={{ stroke: s.color }}
            />
          </g>
        )
      })}
      {annotations.map((a, i) => {
        if (!main.points.length) return null
        const pt = main.points[nearestIndex(main.points, a.t)]!
        const ax = geo.x(pt.t)
        const ay = geo.y(pt.v)
        const above = ay > M.top + 34
        const ly = above ? ay - 14 : ay + 22
        const anchor = ax > plotW * 0.8 ? "end" : ax < plotW * 0.15 ? "start" : "middle"
        return (
          <g key={`${a.t}-${i}`}>
            <line x1={ax} x2={ax} y1={ay} y2={above ? ay - 9 : ay + 9} strokeWidth={1} style={{ stroke: "var(--ink-3)" }} />
            <circle cx={ax} cy={ay} r={3} strokeWidth={1.5} style={{ fill: "var(--paper)", stroke: "var(--ink)" }} />
            <text x={ax} y={ly} fontSize={11.5} textAnchor={anchor} style={{ fill: "var(--ink-2)" }}>
              {a.label}
            </text>
          </g>
        )
      })}
      <line x1={M.left} x2={right} y1={M.top + plotH} y2={M.top + plotH} style={{ stroke: "var(--ink-3)" }} strokeWidth={1} opacity={0.5} />
    </g>
  )
})
