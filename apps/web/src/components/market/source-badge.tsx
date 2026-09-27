"use client"

import { cn } from "@/lib/utils"
import type { DataSource } from "@greencircuits/market/types"
import { useSource } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"

const STYLES: Record<DataSource, string> = {
  LIVE: "border-up/40 text-up",
  DELAYED: "border-warning/50 text-warning",
  EOD: "border-border text-muted-foreground",
  SIMULATED: "border-primary/40 text-primary",
}

const LABELS: Record<DataSource, string> = {
  LIVE: "Live",
  DELAYED: "Delayed",
  EOD: "End of day",
  SIMULATED: "Simulated",
}

const TITLES: Record<DataSource, string | undefined> = {
  LIVE: undefined,
  DELAYED: "Real prices, refreshed every minute and a little behind the exchange.",
  EOD: "The latest closing prices.",
  SIMULATED: "Prices come from the built-in market simulator, not an exchange feed.",
}

/** Every price on screen says where it came from. Without a `source`, it's the feed's. */
export function SourceBadge({ source, className }: { source?: DataSource; className?: string }) {
  const feed = useSource()
  const s = source ?? feed
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 font-mono text-[10px] font-medium tracking-wide uppercase",
        STYLES[s],
        className,
      )}
      title={TITLES[s]}
    >
      {s === "LIVE" && <span className="size-1.5 rounded-full bg-up animate-live" />}
      {LABELS[s]}
    </span>
  )
}

/**
 * Marks illustrative figures. `hideWhenReal` is for figures the real-data
 * loader replaces (company fundamentals); bonds and the sample portfolio stay
 * samples either way.
 */
export function SampleBadge({ className, hideWhenReal = false }: { className?: string; hideWhenReal?: boolean }) {
  const { dataset } = useMarket()
  if (hideWhenReal && dataset === "real") return null
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
