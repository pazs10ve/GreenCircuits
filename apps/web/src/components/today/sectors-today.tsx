"use client"

import { useMemo } from "react"
import { formatPct } from "@greencircuits/market/format"
import { niftyAttribution } from "@greencircuits/market/research/market-story"
import { useQuoteReader } from "@/lib/stream/hooks"
import { cn } from "@/lib/utils"

/** Sectors ranked by today's move, drawn as bars either side of zero. */
export function SectorsToday() {
  const read = useQuoteReader(3000)
  const sectors = useMemo(() => niftyAttribution(read).sectors, [read])
  const max = Math.max(...sectors.map((s) => Math.abs(s.changePct)), 0.5)

  return (
    <ul className="space-y-1">
      {sectors.map((s) => (
        <li key={s.sector} className="grid grid-cols-[7.5rem_minmax(0,1fr)_4rem] items-center gap-3 py-1 text-sm">
          <span className="truncate">{s.sector === "IT" ? "IT" : s.sector}</span>
          <span className="relative h-3">
            <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink-3/50" />
            <span
              className={cn("absolute inset-y-0 rounded-[2px] transition-[width] duration-700", s.changePct >= 0 ? "left-1/2 bg-up/75" : "right-1/2 bg-down/75")}
              style={{ width: `${(Math.abs(s.changePct) / max) * 50}%` }}
            />
          </span>
          <span className={cn("num text-right", s.changePct > 0 ? "text-up" : s.changePct < 0 ? "text-down" : "text-ink-2")}>
            {formatPct(s.changePct, 1)}
          </span>
        </li>
      ))}
    </ul>
  )
}
