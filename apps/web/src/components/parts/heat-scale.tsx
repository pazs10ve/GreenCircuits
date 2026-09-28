import { cn } from "@/lib/utils"
import { heat } from "./heat"

/** The key to a heat map's colours, from a 3% fall to a 3% rise. */
export function HeatScale({ cap = 3, className }: { cap?: number; className?: string }) {
  const steps = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1].map((f) => f * cap)
  return (
    <span className={cn("num inline-flex items-center gap-1.5 text-[11px] text-ink-3", className)} aria-hidden="true">
      −{cap}%
      <span className="inline-flex gap-px overflow-hidden rounded-[3px]">
        {steps.map((v) => (
          <span key={v} className="h-2 w-4" style={{ background: heat(v, cap).bg }} />
        ))}
      </span>
      +{cap}%
    </span>
  )
}
