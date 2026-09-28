"use client"

import Link from "next/link"
import { getInstrument, hrefOf } from "@greencircuits/market/catalog"
import { LivePrice } from "@/components/market/price"
import { LiveMove } from "@/components/parts/live-move"
import { Sparkline } from "@/components/market/sparkline"
import { useQuote } from "@/lib/stream/hooks"
import { withLive } from "@/components/stocks/derive"

function Card({ id, spark, note }: { id: number; spark: number[]; note?: string }) {
  const inst = getInstrument(id)
  const q = useQuote(id)
  if (!inst) return null
  return (
    <Link href={hrefOf(inst)} className="group flex min-w-0 flex-col gap-2 rounded-card border border-rule bg-paper p-4 transition-colors hover:border-rule-strong">
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-xs text-ink-3 group-hover:text-ink-2">
          {inst.name}
          {note && <span> · {note}</span>}
        </span>
        <LiveMove id={id} />
      </span>
      <LivePrice id={id} className="figure text-[1.5rem] leading-none" />
      {/* Stretched to the tile's width: the line's shape matters, not its scale. */}
      <Sparkline data={withLive(spark, q?.ltp, true)} width={160} height={26} className="mt-1 h-[26px] w-full" />
    </Link>
  )
}

/** The markets a reader checks first, each with its last six weeks as a line. */
export function IndexCards({ cards }: { cards: { id: number; spark: number[]; note?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
      {cards.map((c) => (
        <Card key={c.id} {...c} />
      ))}
    </div>
  )
}
