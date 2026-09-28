"use client"

import Link from "next/link"
import { useMemo } from "react"
import { notableMoves, unusualMoves, type MoveNote } from "@greencircuits/market/research/market-story"
import { Meter } from "@/components/parts/meter"
import { Monogram } from "@/components/parts/monogram"
import { Move } from "@/components/parts/move"
import { useDailyBarsOf } from "@/lib/data/client"
import { useQuoteReader, useSession } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"

/** How many of each way to show. */
const EACH = 4

/**
 * The day's most unusual moves, risers beside fallers, each with a line of
 * context from the data. In live mode how rare a move is comes from the
 * stock's real daily bars, fetched for the ones in the running.
 */
export function WhatMoved({ ranges, results, members }: { ranges: [number, number, number][]; results: [number, string][]; members?: number[] }) {
  const read = useQuoteReader(5000)
  const { mode } = useMarket()
  const { closed } = useSession()
  const byId = useMemo(() => new Map(ranges.map(([id, high, low]) => [id, { high, low }])), [ranges])
  const due = useMemo(() => new Map(results), [results])
  const shown = useMemo(() => unusualMoves(read, EACH * 3).map((m) => m.inst.id), [read])
  const bars = useDailyBarsOf(mode === "live" ? shown : [], 260)
  const moves = useMemo(
    () => notableMoves(read, byId, due, EACH * 3, { members, closed, history: mode === "live" ? (id) => bars?.get(id) : undefined }),
    [read, byId, due, members, closed, mode, bars],
  )
  const ups = moves.filter((m) => m.q.changePct > 0).slice(0, EACH)
  const downs = moves.filter((m) => m.q.changePct < 0).slice(0, EACH)
  const max = Math.max(0.1, ...[...ups, ...downs].map((m) => Math.abs(m.q.changePct)))

  return (
    <div className="grid gap-x-8 md:grid-cols-2">
      <Column label="Rising" rows={ups} max={max} />
      <Column label="Falling" rows={downs} max={max} />
    </div>
  )
}

function Column({ label, rows, max }: { label: string; rows: MoveNote[]; max: number }) {
  return (
    <ol aria-label={label} className="-my-2.5 divide-y divide-rule max-md:[&:last-child]:mt-0 max-md:[&:last-child]:border-t max-md:[&:last-child]:border-rule">
      {rows.map(({ inst, q, note }) => (
        <li key={inst.id}>
          <Link href={`/stocks/${inst.slug}`} className="group grid grid-cols-[30px_minmax(0,1fr)_minmax(2.5rem,6rem)_4rem] items-center gap-3 py-2.5">
            <Monogram text={inst.symbol} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4">{inst.name}</span>
              <span className="block truncate text-xs text-ink-3" title={note}>
                {note}
              </span>
            </span>
            <Meter value={Math.abs(q.changePct) / max} height={5} barClassName={q.changePct >= 0 ? "bg-up" : "bg-down"} />
            <span className="flex justify-end">
              <Move value={q.changePct} digits={1} />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}
