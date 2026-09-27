"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow } from "@/hooks/use-now"
import { formatTimeIST } from "@greencircuits/market/format"
import { cn } from "@/lib/utils"

/** The one place the app says its prices aren't real, instead of a badge on every panel. */
export function DemoMarker({ className }: { className?: string }) {
  const now = useNow(15_000)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("flex cursor-default items-center gap-2 text-[13px] text-ink-2", className)} tabIndex={0}>
          <span className="animate-live size-1.5 rounded-full bg-up" aria-hidden="true" />
          Demo market
          {now && <span className="num text-ink-3">{formatTimeIST(now)} IST</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 text-xs leading-relaxed">
        Prices come from a market simulator that runs around the clock, and company figures are samples. Nothing here
        describes a real market.
      </TooltipContent>
    </Tooltip>
  )
}
