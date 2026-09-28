"use client"

import Link from "next/link"
import { COMMODITIES } from "@greencircuits/market/catalog"
import { COMMODITY_GROUPS } from "@greencircuits/market/reference"
import type { Instrument } from "@greencircuits/market/types"
import { Price } from "@/components/market/price"
import { Sparkline } from "@/components/market/sparkline"
import { LiveMove } from "@/components/parts/live-move"
import { withLive } from "@/components/stocks/derive"
import { useQuote } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { cn } from "@/lib/utils"
import { commodityName, unitWords } from "./units"

const ORDER = Object.values(COMMODITY_GROUPS).flat()

function Tile({ inst, spark, selected }: { inst: Instrument; spark: number[]; selected: boolean }) {
  const q = useQuote(inst.id)
  const { dataset } = useMarket()
  return (
    <Link
      href={`/commodities?c=${inst.slug}`}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group flex min-w-0 flex-col gap-2 rounded-card border bg-paper p-4 transition-colors",
        selected ? "border-ink shadow-[inset_0_0_0_1px_var(--ink)]" : "border-rule hover:border-rule-strong",
      )}
    >
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className={cn("truncate text-xs", selected ? "font-semibold text-ink" : "text-ink-3 group-hover:text-ink-2")}>{commodityName(inst)}</span>
        <LiveMove id={inst.id} />
      </span>
      <span className="figure text-[1.375rem] leading-none">
        <span className="mr-0.5 text-[0.6em] text-ink-3">₹</span>
        <Price value={q?.ltp} tick={inst.tick} />
      </span>
      <span className="-mt-1 truncate text-[11px] text-ink-3">{unitWords(inst).replace("₹ per ", "per ")}</span>
      {/* Stretched to the tile's width: the line's shape matters, not its scale. */}
      <Sparkline data={withLive(spark, q?.ltp, dataset === "real")} width={160} height={26} className="mt-auto h-[26px] w-full" />
    </Link>
  )
}

/** Every commodity as a tile with its live price and its last month as a line; the tiles pick which one fills the page below. */
export function CommodityTiles({ sparks, selected }: { sparks: Record<number, number[]>; selected: number }) {
  const shown = [...COMMODITIES].filter((c) => sparks[c.id]).sort((a, b) => ORDER.indexOf(a.symbol) - ORDER.indexOf(b.symbol))
  return (
    <nav aria-label="Commodities" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7 lg:gap-4">
      {shown.map((inst) => (
        <Tile key={inst.id} inst={inst} spark={sparks[inst.id]!} selected={inst.id === selected} />
      ))}
    </nav>
  )
}
