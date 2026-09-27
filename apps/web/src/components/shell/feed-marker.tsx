"use client"

import type { Dataset, Source } from "@greencircuits/contracts"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow } from "@/hooks/use-now"
import { formatTimeIST } from "@greencircuits/market/format"
import { useSource } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { cn } from "@/lib/utils"

const REAL_FIGURES =
  "Price history, results and shareholding come from Yahoo Finance and NSE's website: free, unofficial sources, used here for personal study."

function describe(dataset: Dataset, source: Source): { label: string; moving: boolean; detail: string } {
  if (dataset === "sample") {
    return {
      label: "Demo market",
      moving: true,
      detail: "Prices come from a market simulator that runs around the clock, and company figures are samples. Nothing here describes a real market.",
    }
  }
  if (source === "SIMULATED") {
    return {
      label: "Simulated prices",
      moving: true,
      detail: `The prices moving now come from the simulator; everything else is real. ${REAL_FIGURES} Run the price feed with FEED_PROVIDER=yahoo for real prices.`,
    }
  }
  if (source === "EOD") {
    return {
      label: "Closing prices",
      moving: false,
      detail: `Prices are the latest close. While NSE trades (09:15 to 15:30 IST on weekdays), the price feed refreshes them every minute. ${REAL_FIGURES}`,
    }
  }
  return {
    label: "NSE, delayed",
    moving: true,
    detail: `Real prices, refreshed every minute and a little behind the exchange. ${REAL_FIGURES}`,
  }
}

/** The one place the app says what its prices are, instead of a badge on every panel. */
export function FeedMarker({ className }: { className?: string }) {
  const now = useNow(15_000)
  const { dataset } = useMarket()
  const { label, moving, detail } = describe(dataset, useSource())
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("flex cursor-default items-center gap-2 text-[13px] text-ink-2", className)} tabIndex={0}>
          <span className={cn("size-1.5 rounded-full", moving ? "animate-live bg-up" : "bg-ink-3")} aria-hidden="true" />
          {label}
          {now && <span className="num text-ink-3">{formatTimeIST(now)} IST</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72 text-xs leading-relaxed">
        {detail}
      </TooltipContent>
    </Tooltip>
  )
}
