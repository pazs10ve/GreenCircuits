import { formatSigned } from "@greencircuits/market/format"
import { Tag } from "@/components/parts/tag"
import { cn } from "@/lib/utils"

/**
 * A yield's change in basis points, on the move chip's tints. Yields up is
 * bonds down, so the colour follows what the change does to a bond holder.
 */
export function Bp({ value, className }: { value: number | null; className?: string }) {
  if (value == null) return <span className={cn("num text-xs text-ink-3", className)}>–</span>
  return (
    <Tag tone={value > 0.5 ? "down" : value < -0.5 ? "up" : "neutral"} className={cn("num", className)}>
      {formatSigned(value, 0)} bp
    </Tag>
  )
}
