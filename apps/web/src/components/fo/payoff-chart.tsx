"use client"

import { useId, useState } from "react"
import { useElementSize } from "@/hooks/use-element-size"
import { formatCompact, formatINR, formatNumber } from "@greencircuits/market/format"
import { cn } from "@/lib/utils"

const PAD = { l: 50, r: 12, t: 18, b: 24 }

function niceStep(span: number, count: number): number {
  const raw = Math.max(span, 1e-9) / Math.max(1, count)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag
}

function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-6 ? 0 : v)
  return out
}

function rupeesShort(v: number): string {
  if (v === 0) return "₹0"
  const a = Math.abs(v)
  return `${v < 0 ? "−" : ""}₹${formatCompact(a, a >= 1e5 && a % 1e5 !== 0 ? 1 : 0)}`
}

function signedRupees(v: number): string {
  const text = formatINR(Math.abs(v), 0)
  return Math.round(v) === 0 ? text : `${v > 0 ? "+" : "−"}${text}`
}

/**
 * Strategy P&L across underlying prices: at the nearest expiry (solid, green
 * above zero and red below) and today (dashed copper), with the spot and
 * breakevens marked and a crosshair that reads out both curves.
 */
export function PayoffChart({
  xs,
  expiry,
  today,
  spot,
  breakevens,
  height = 240,
  className,
}: {
  xs: number[]
  expiry: number[]
  today: number[]
  spot: number
  breakevens: number[]
  height?: number
  className?: string
}) {
  const [ref, { width }] = useElementSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "")

  const xMin = xs[0] ?? 0
  const xMax = xs.at(-1) ?? 1
  const lo = Math.min(0, ...expiry, ...today)
  const hi = Math.max(0, ...expiry, ...today)
  const yStep = niceStep(hi - lo || 1, 4)
  const yMin = Math.floor(lo / yStep) * yStep
  const yMax = Math.max(Math.ceil(hi / yStep) * yStep, yMin + yStep)
  const plotW = Math.max(1, width - PAD.l - PAD.r)
  const plotH = height - PAD.t - PAD.b
  const X = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin || 1)) * plotW
  const Y = (v: number) => PAD.t + ((yMax - v) / (yMax - yMin || 1)) * plotH
  const zeroY = Y(0)

  const path = (ys: number[]) => xs.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(ys[i]!).toFixed(1)}`).join("")
  const expiryPath = path(expiry)
  const area = `${expiryPath}L${X(xMax).toFixed(1)},${zeroY.toFixed(1)}L${X(xMin).toFixed(1)},${zeroY.toFixed(1)}Z`
  const xStep = niceStep(xMax - xMin, Math.max(2, Math.floor(plotW / 90)))
  const beLabels = breakevens.filter((b) => b > xMin && b < xMax)
  const xTicks = ticks(xMin, xMax, xStep).filter((v) => beLabels.every((b) => Math.abs(X(v) - X(b)) > 44))

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const v = xMin + ((e.clientX - rect.left - PAD.l) / plotW) * (xMax - xMin)
    let a = 0
    let b = xs.length - 1
    while (b - a > 1) {
      const m = (a + b) >> 1
      if (xs[m]! < v) a = m
      else b = m
    }
    setHover(Math.abs(xs[a]! - v) <= Math.abs(xs[b]! - v) ? a : b)
  }

  const h = hover != null && hover < xs.length ? hover : null
  const tipLeft = h == null ? 0 : Math.min(Math.max(X(xs[h]!) + 10, PAD.l), Math.max(PAD.l, width - 168))

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block touch-pan-y"
          role="img"
          aria-label="Payoff chart: profit and loss at expiry and today across underlying prices"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={`${uid}-up`}>
              <rect x={0} y={0} width={width} height={Math.max(0, zeroY)} />
            </clipPath>
            <clipPath id={`${uid}-dn`}>
              <rect x={0} y={zeroY} width={width} height={Math.max(0, height - zeroY)} />
            </clipPath>
          </defs>

          {ticks(yMin, yMax, yStep).map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={width - PAD.r} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeDasharray={v === 0 ? undefined : "2 4"} />
              <text x={PAD.l - 6} y={Y(v)} textAnchor="end" dominantBaseline="middle" className="num fill-ink-3 text-[11px]">
                {rupeesShort(v)}
              </text>
            </g>
          ))}

          <path d={area} fill="var(--up)" fillOpacity={0.14} clipPath={`url(#${uid}-up)`} />
          <path d={area} fill="var(--down)" fillOpacity={0.14} clipPath={`url(#${uid}-dn)`} />
          <line x1={PAD.l} x2={width - PAD.r} y1={zeroY} y2={zeroY} stroke="var(--ink-3)" strokeOpacity={0.55} />
          <path d={expiryPath} fill="none" stroke="var(--up)" strokeWidth={1.75} strokeLinejoin="round" clipPath={`url(#${uid}-up)`} />
          <path d={expiryPath} fill="none" stroke="var(--down)" strokeWidth={1.75} strokeLinejoin="round" clipPath={`url(#${uid}-dn)`} />
          <path d={path(today)} fill="none" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="5 4" strokeLinejoin="round" />

          {spot >= xMin && spot <= xMax && (
            <g>
              <line x1={X(spot)} x2={X(spot)} y1={PAD.t} y2={height - PAD.b} stroke="var(--foreground)" strokeOpacity={0.45} strokeDasharray="3 3" />
              <text x={X(spot)} y={PAD.t - 6} textAnchor="middle" className="num fill-ink text-[11px] font-medium">
                Spot {formatNumber(spot, 0)}
              </text>
            </g>
          )}

          {beLabels.map((b) => (
            <g key={b}>
              <line x1={X(b)} x2={X(b)} y1={zeroY} y2={height - PAD.b} stroke="var(--primary)" strokeOpacity={0.5} />
              <circle cx={X(b)} cy={zeroY} r={3.5} fill="var(--card)" stroke="var(--primary)" strokeWidth={1.5} />
              <text x={X(b)} y={height - 7} textAnchor="middle" className="num fill-ink text-[11px] font-medium">
                {formatNumber(b, 0)}
              </text>
            </g>
          ))}
          {xTicks.map((v) => (
            <text key={v} x={X(v)} y={height - 7} textAnchor="middle" className="num fill-ink-3 text-[11px]">
              {formatNumber(v, 0)}
            </text>
          ))}

          {h != null && (
            <g pointerEvents="none">
              <line x1={X(xs[h]!)} x2={X(xs[h]!)} y1={PAD.t} y2={height - PAD.b} stroke="var(--foreground)" strokeOpacity={0.6} />
              <circle cx={X(xs[h]!)} cy={Y(expiry[h]!)} r={3.5} fill={expiry[h]! >= 0 ? "var(--up)" : "var(--down)"} stroke="var(--card)" strokeWidth={1.5} />
              <circle cx={X(xs[h]!)} cy={Y(today[h]!)} r={3} fill="var(--primary)" stroke="var(--card)" strokeWidth={1.5} />
            </g>
          )}
        </svg>
      )}
      {h != null && (
        <div
          className="pointer-events-none absolute top-5 w-44 rounded-md border bg-popover px-2.5 py-2 text-xs shadow-md"
          style={{ left: tipLeft }}
        >
          <div className="num mb-1 font-semibold">At {formatNumber(xs[h]!, 2)}</div>
          <Row label="At expiry" value={expiry[h]!} />
          <Row label="Today" value={today[h]!} />
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-3">{label}</span>
      <span className={cn("num font-medium", value > 0.5 ? "text-up" : value < -0.5 ? "text-down" : "")}>{signedRupees(value)}</span>
    </div>
  )
}
