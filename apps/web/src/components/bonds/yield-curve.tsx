"use client"

import { useState } from "react"
import type { CurvePoint } from "@greencircuits/market/reference"
import { formatNumber, formatSigned } from "@greencircuits/market/format"
import { useElementSize } from "@/hooks/use-element-size"
import { cn } from "@/lib/utils"

const HEIGHT = 260
const M = { top: 14, right: 16, bottom: 26, left: 44 }

const SERIES = [
  { key: "today", label: "Today", stroke: "var(--ink)", width: 2, dash: undefined, swatch: "bg-ink" },
  { key: "monthAgo", label: "A month ago", stroke: "var(--ink-3)", width: 1.5, dash: "5 4", swatch: "bg-ink-3" },
  { key: "yearAgo", label: "A year ago", stroke: "var(--accent-ink)", width: 1.5, dash: "1.5 3.5", swatch: "bg-accent-ink" },
] as const

type SeriesKey = (typeof SERIES)[number]["key"]

export function tenorLabel(t: number): string {
  return t < 1 ? `${Math.round(t * 12)}M` : `${t}Y`
}

/** Monotone cubic through the points (like d3's curveMonotoneX): smooth, and never overshoots between tenors. */
function monotonePath(pts: [number, number][]): string {
  const n = pts.length
  if (n < 2) return ""
  const secant: number[] = []
  for (let i = 0; i < n - 1; i++) secant.push((pts[i + 1]![1] - pts[i]![1]) / (pts[i + 1]![0] - pts[i]![0]))
  const tangent = pts.map((_, i) => {
    if (i === 0) return secant[0]!
    if (i === n - 1) return secant[n - 2]!
    const [s0, s1] = [secant[i - 1]!, secant[i]!]
    if (s0 * s1 <= 0) return 0
    const h0 = pts[i]![0] - pts[i - 1]![0]
    const h1 = pts[i + 1]![0] - pts[i]![0]
    const p = (s0 * h1 + s1 * h0) / (h0 + h1)
    return Math.sign(s0) * 2 * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p))
  })
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!
    const [x1, y1] = pts[i + 1]!
    const dx = (x1 - x0) / 3
    d += ` C${(x0 + dx).toFixed(1)},${(y0 + dx * tangent[i]!).toFixed(1)} ${(x1 - dx).toFixed(1)},${(y1 - dx * tangent[i + 1]!).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
  }
  return d
}

function bp(a: number, b: number): string {
  return `${formatSigned((a - b) * 100, 0)} bp`
}

/**
 * G-Sec par yield curve: today, a month ago and a year ago. The x axis is
 * maturity on a log(1 + years) scale, so the short end is readable.
 * Hover, tap or use the arrow keys to read values at each tenor.
 */
export function YieldCurveChart({ points }: { points: CurvePoint[] }) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const benchmark = Math.max(0, points.findIndex((p) => p.tenor === 10))
  const [active, setActive] = useState<number | null>(null)
  const shown = active ?? benchmark
  const point = points[shown]!

  const width = size.width
  const plotW = Math.max(0, width - M.left - M.right)
  const plotH = HEIGHT - M.top - M.bottom
  const lx = (t: number) => Math.log(1 + t)
  const [t0, t1] = [lx(points[0]!.tenor), lx(points.at(-1)!.tenor)]
  const x = (t: number) => M.left + ((lx(t) - t0) / (t1 - t0)) * plotW

  const values = points.flatMap((p) => [p.today, p.monthAgo, p.yearAgo])
  const step = 0.5
  const yMin = Math.floor((Math.min(...values) - 0.1) / step) * step
  const yMax = Math.ceil((Math.max(...values) + 0.1) / step) * step
  const y = (v: number) => M.top + ((yMax - v) / (yMax - yMin)) * plotH
  const yTicks: number[] = []
  for (let v = yMin; v <= yMax + 1e-9; v += step) yTicks.push(v)

  // Drop x labels that would collide on narrow screens.
  const xLabels: number[] = []
  let lastX = -Infinity
  points.forEach((p, i) => {
    const px = x(p.tenor)
    if (px - lastX >= 30 || i === points.length - 1) {
      if (i === points.length - 1 && px - lastX < 30) xLabels.pop()
      xLabels.push(i)
      lastX = px
    }
  })

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(x(p.tenor) - px) < Math.abs(x(points[best]!.tenor) - px)) best = i
    })
    return best
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowLeft: shown - 1, ArrowRight: shown + 1, Home: 0, End: points.length - 1 }
    if (!(e.key in keys)) return
    e.preventDefault()
    setActive(Math.min(points.length - 1, Math.max(0, keys[e.key]!)))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div aria-live="polite" className="min-w-0">
          <div className="text-[13px] text-ink-3">
            {tenorLabel(point.tenor)} G-Sec{point.tenor === 10 ? " · benchmark" : ""}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="figure text-[1.75rem] leading-tight">{formatNumber(point.today, 2)}%</span>
            <span className="num text-[13px] text-ink-3">
              {bp(point.today, point.monthAgo)} vs a month ago · {bp(point.today, point.yearAgo)} vs a year ago
            </span>
          </div>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <svg width="16" height="6" aria-hidden="true" className="shrink-0">
                <line x1="0" x2="16" y1="3" y2="3" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="Yield curve chart. Use the left and right arrow keys to read each maturity."
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        style={{ height: HEIGHT }}
      >
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            className="block touch-pan-y select-none"
            aria-hidden="true"
            onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
            onPointerDown={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
            onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
          >
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" />
                <text x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="num fill-ink-3 text-[11px]">
                  {formatNumber(v, 1)}%
                </text>
              </g>
            ))}
            {xLabels.map((i) => (
              <text
                key={i}
                x={x(points[i]!.tenor)}
                y={HEIGHT - 8}
                textAnchor="middle"
                className={cn("num text-[11px]", i === shown ? "fill-ink font-medium" : "fill-ink-3")}
              >
                {tenorLabel(points[i]!.tenor)}
              </text>
            ))}

            <line x1={x(point.tenor)} x2={x(point.tenor)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--ink-3)" strokeOpacity={0.5} strokeDasharray="3 3" />

            {[...SERIES].reverse().map((s) => (
              <path
                key={s.key}
                d={monotonePath(points.map((p) => [x(p.tenor), y(p[s.key as SeriesKey])]))}
                fill="none"
                stroke={s.stroke}
                strokeWidth={s.width}
                strokeDasharray={s.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {points.map((p, i) => (
              <circle key={p.tenor} cx={x(p.tenor)} cy={y(p.today)} r={i === shown ? 0 : 2.25} fill="var(--ink)" />
            ))}
            {SERIES.map((s) => (
              <circle
                key={s.key}
                cx={x(point.tenor)}
                cy={y(point[s.key as SeriesKey])}
                r={s.key === "today" ? 4.5 : 3.5}
                fill="var(--card)"
                stroke={s.stroke}
                strokeWidth={2}
              />
            ))}
          </svg>
        )}
      </div>

      <table className="sr-only">
        <caption>G-Sec yields by maturity, per cent</caption>
        <thead>
          <tr>
            <th scope="col">Maturity</th>
            <th scope="col">Today</th>
            <th scope="col">A month ago</th>
            <th scope="col">A year ago</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.tenor}>
              <th scope="row">{tenorLabel(p.tenor)}</th>
              <td>{formatNumber(p.today, 2)}</td>
              <td>{formatNumber(p.monthAgo, 2)}</td>
              <td>{formatNumber(p.yearAgo, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
