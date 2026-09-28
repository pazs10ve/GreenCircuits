import { cn } from "@/lib/utils"

interface Line {
  id: string
  label: string
  points: { t: number; v: number }[]
  color: string
  width?: number
  dashed?: boolean
}

const W = 600

/**
 * A static two-or-three-line chart that renders on the server: a stretched
 * viewBox with non-scaling strokes, and the labels in HTML beside each line's
 * end so the text never distorts.
 */
export function MiniLines({
  lines,
  height = 140,
  className,
  ariaLabel,
  format,
  labels = true,
}: {
  lines: Line[]
  height?: number
  className?: string
  ariaLabel: string
  format?: (v: number) => string
  /** Names at the lines' ends; off when the figures are shown elsewhere. */
  labels?: boolean
}) {
  const all = lines.flatMap((l) => l.points)
  if (all.length < 2) return null
  const t0 = Math.min(...all.map((p) => p.t))
  const t1 = Math.max(...all.map((p) => p.t))
  let lo = Math.min(...all.map((p) => p.v))
  let hi = Math.max(...all.map((p) => p.v))
  const pad = (hi - lo) * 0.06 || 1
  lo -= pad
  hi += pad
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W
  const y = (v: number) => (1 - (v - lo) / (hi - lo)) * height
  const ends = lines
    .map((l) => ({ l, top: (y(l.points.at(-1)!.v) / height) * 100 }))
    .sort((a, b) => a.top - b.top)
  // Keep end labels apart: one line of text, or two when the value is shown under the label.
  const minGap = ((format ? 30 : 16) / height) * 100
  for (let i = 1; i < ends.length; i++) if (ends[i]!.top - ends[i - 1]!.top < minGap) ends[i]!.top = ends[i - 1]!.top + minGap

  return (
    <div className={cn("grid gap-3", labels ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1", className)}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={ariaLabel}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={height * f} y2={height * f} style={{ stroke: "var(--rule-strong)" }} strokeWidth={1} strokeDasharray="1 5" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={0} x2={W} y1={height - 0.5} y2={height - 0.5} style={{ stroke: "var(--ink-3)" }} strokeWidth={1} opacity={0.5} vectorEffect="non-scaling-stroke" />
        {lines.map((l) => (
          <path
            key={l.id}
            d={l.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("")}
            fill="none"
            strokeWidth={l.width ?? 1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={l.dashed ? "4 3" : undefined}
            vectorEffect="non-scaling-stroke"
            style={{ stroke: l.color }}
          />
        ))}
      </svg>
      {labels && (
        <div className="relative w-[5.5rem]" style={{ height }} aria-hidden="true">
          {ends.map(({ l, top }) => (
            <span key={l.id} className="absolute left-0 -translate-y-1/2 text-xs leading-tight font-medium" style={{ top: `${top}%`, color: l.color }}>
              {l.label}
              {format && <span className="num block font-normal text-ink-3">{format(l.points.at(-1)!.v)}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
