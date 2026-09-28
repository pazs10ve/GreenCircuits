import { direction, formatPct, formatSigned } from "@greencircuits/market/format"
import { cn } from "@/lib/utils"

/**
 * A move on a soft tint: the one place where up and down colour a fill. The
 * same chip for a price's day, a year's return, a gain since buying.
 */
export function Move({
  value,
  digits = 2,
  unit = "%",
  size = "sm",
  className,
}: {
  value: number | null | undefined
  digits?: number
  /** "%" for a percentage, "pts" for index points or percentage points, "" for a bare signed number. */
  unit?: "%" | "pts" | ""
  size?: "sm" | "md"
  className?: string
}) {
  if (value == null || Number.isNaN(value)) return <span className={cn("num text-xs text-ink-3", className)}>–</span>
  const dir = direction(value)
  const text = unit === "%" ? formatPct(value, digits) : `${formatSigned(value, digits)}${unit ? ` ${unit}` : ""}`
  return (
    <span
      className={cn(
        "num inline-flex items-center rounded-md px-1.5 py-px font-semibold whitespace-nowrap",
        size === "sm" ? "text-xs" : "text-[13px]",
        dir === "up" ? "bg-up-soft text-up" : dir === "down" ? "bg-down-soft text-down" : "bg-surface-2 text-ink-2",
        className,
      )}
    >
      {text}
    </span>
  )
}
