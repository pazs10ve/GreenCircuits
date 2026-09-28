import { cn } from "@/lib/utils"

/** How much, as a bar from zero: a weight, a return on equity, a spread. Ink unless the sign is the point. Value runs 0 to 1. */
export function Meter({ value, height = 6, className, barClassName }: { value: number; height?: number; className?: string; barClassName?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-full bg-surface-2", className)} style={{ height }} aria-hidden="true">
      <div className={cn("h-full rounded-full bg-ink", barClassName)} style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
    </div>
  )
}
