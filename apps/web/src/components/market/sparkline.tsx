import { monotonePath } from "@/components/viz/scales"
import { cn } from "@/lib/utils"

/**
 * A small trend line, drawn as a smooth curve through the points. Its colour
 * follows the direction from first point to last, unless `color` says otherwise.
 */
export function Sparkline({
  data,
  width = 72,
  height = 24,
  className,
  area = false,
  color,
}: {
  data: number[]
  width?: number
  height?: number
  className?: string
  area?: boolean
  /** A CSS colour, e.g. "var(--ink-3)", for a line whose direction isn't the point. */
  color?: string
}) {
  if (data.length < 2) return <svg width={width} height={height} className={className} aria-hidden="true" />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 3 - ((v - min) / span) * (height - 6)] as const)
  const line = monotonePath(pts)
  const stroke = color ?? (data.at(-1)! >= data[0]! ? "var(--up)" : "var(--down)")
  return (
    // Stretches to whatever width a class gives it; the stroke keeps its weight.
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} preserveAspectRatio="none" className={cn("block shrink-0 overflow-visible", className)} aria-hidden="true">
      {area && <path d={`${line}L${width},${height}L0,${height}Z`} style={{ fill: stroke }} opacity={0.08} />}
      <path d={line} fill="none" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ stroke }} />
    </svg>
  )
}
