import { cn } from "@/lib/utils"

/** Tiny trend line. Colour follows the direction from first to last point. */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  className,
  area = true,
}: {
  data: number[]
  width?: number
  height?: number
  className?: string
  area?: boolean
}) {
  if (data.length < 2) return <svg width={width} height={height} className={className} aria-hidden="true" />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)] as const)
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const up = data.at(-1)! >= data[0]!
  const color = up ? "var(--up)" : "var(--down)"
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("overflow-visible", className)}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      {area && (
        <path d={`${line} L${width},${height} L0,${height} Z`} fill={color} opacity={0.12} />
      )}
      <path d={line} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={1.8} fill={color} />
    </svg>
  )
}
