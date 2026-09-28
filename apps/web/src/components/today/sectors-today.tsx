"use client"

import Link from "next/link"
import { useMemo } from "react"
import { formatPct } from "@greencircuits/market/format"
import { sectorChanges } from "@greencircuits/market/research/market-story"
import { heat } from "@/components/parts/heat"
import { useQuoteReader } from "@/lib/stream/hooks"

/** Every sector as a tile, coloured by the day's move across its companies, weighted by size; leaders first. */
export function SectorsToday() {
  const read = useQuoteReader(3000)
  const sectors = useMemo(
    () =>
      [...sectorChanges(read)]
        .map(([sector, changePct]) => ({ sector, changePct }))
        .sort((a, b) => b.changePct - a.changePct),
    [read],
  )
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {sectors.map((s) => {
        const { bg, fg } = heat(s.changePct, 2.2)
        return (
          <li key={s.sector}>
            <Link
              href={`/stocks?sector=${s.sector.toLowerCase()}`}
              className="flex h-14 flex-col justify-between rounded-panel px-3 py-2 transition-[filter] hover:brightness-95"
              style={{ background: bg, color: fg }}
            >
              <span className="truncate text-[13px] font-semibold">{s.sector}</span>
              <span className="num text-[15px] leading-none font-bold">{formatPct(s.changePct, 1)}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
