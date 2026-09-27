"use client"

import Link from "next/link"
import { useMemo } from "react"
import { formatPct, formatPrice } from "@greencircuits/market/format"
import { notableMoves, unusualMoves } from "@greencircuits/market/research/market-story"
import { useDailyBarsOf } from "@/lib/data/client"
import { useQuoteReader, useSession } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { cn } from "@/lib/utils"

/**
 * The day's most unusual moves, each with a line of context from the data.
 * In live mode how rare a move is comes from the stock's real daily bars,
 * fetched for the five shown.
 */
export function WhatMoved({ ranges, results, members }: { ranges: [number, number, number][]; results: [number, string][]; members?: number[] }) {
  const read = useQuoteReader(5000)
  const { mode } = useMarket()
  const { closed } = useSession()
  const byId = useMemo(() => new Map(ranges.map(([id, high, low]) => [id, { high, low }])), [ranges])
  const due = useMemo(() => new Map(results), [results])
  const shown = useMemo(() => unusualMoves(read, 5).map((m) => m.inst.id), [read])
  const bars = useDailyBarsOf(mode === "live" ? shown : [], 260)
  const moves = useMemo(
    () => notableMoves(read, byId, due, 5, { members, closed, history: mode === "live" ? (id) => bars?.get(id) : undefined }),
    [read, byId, due, members, closed, mode, bars],
  )

  return (
    <ol className="divide-y divide-rule">
      {moves.map(({ inst, q, note }) => (
        <li key={inst.id}>
          <Link href={`/stocks/${inst.slug}`} className="group grid gap-x-8 gap-y-1 py-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_7rem]">
            <span className="min-w-0">
              <span className="block font-serif text-[1.125rem] leading-snug font-semibold group-hover:underline">{inst.name}</span>
              <span className="block text-[13px] text-ink-3">
                {inst.symbol} · {inst.sector}
              </span>
            </span>
            <span className="text-[0.9375rem] leading-relaxed text-ink-2 md:pt-0.5">{note}</span>
            <span className="flex items-baseline gap-3 md:block md:text-right">
              <span className={cn("figure block text-[1.25rem]", q.changePct >= 0 ? "text-up" : "text-down")}>{formatPct(q.changePct, 1)}</span>
              <span className="num block text-[13px] text-ink-3">₹{formatPrice(q.ltp, inst.tick)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}
