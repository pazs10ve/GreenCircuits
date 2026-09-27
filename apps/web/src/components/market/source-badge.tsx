import { cn } from "@/lib/utils"
import type { DataSource } from "@greencircuits/market/types"

const STYLES: Record<DataSource, string> = {
  LIVE: "border-up/40 text-up",
  DELAYED: "border-warning/50 text-warning",
  EOD: "border-border text-muted-foreground",
  SIMULATED: "border-primary/40 text-primary",
}

const LABELS: Record<DataSource, string> = {
  LIVE: "Live",
  DELAYED: "Delayed 15 min",
  EOD: "End of day",
  SIMULATED: "Simulated",
}

/** Every price on screen says where it came from. The data licence depends on it. */
export function SourceBadge({ source = "SIMULATED", className }: { source?: DataSource; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 font-mono text-[10px] font-medium tracking-wide uppercase",
        STYLES[source],
        className,
      )}
      title={source === "SIMULATED" ? "Prices come from the built-in market simulator, not an exchange feed." : undefined}
    >
      {source === "LIVE" && <span className="size-1.5 rounded-full bg-up animate-live" />}
      {LABELS[source]}
    </span>
  )
}

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm border border-dashed border-border px-1.5 font-mono text-[10px] font-medium tracking-wide text-muted-foreground uppercase",
        className,
      )}
      title="Illustrative data generated for the demo."
    >
      Sample data
    </span>
  )
}
