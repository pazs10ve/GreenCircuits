"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { getInstrument, hrefOf, marketCapCr, membersOf } from "@greencircuits/market/catalog"
import { formatNumber, formatSigned } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { Monogram } from "@/components/parts/monogram"
import { Move } from "@/components/parts/move"
import { cn } from "@/lib/utils"

const FIRST = 20

/**
 * An index's members ranked by how many points each is adding or taking off
 * today, weighted by market value at yesterday's close. `members` are the ids
 * the API has; without them, the demo universe's membership. A broad index
 * shows the twenty that matter most, and the rest on request.
 */
export function Constituents({ indexId, members: ids }: { indexId: number; members?: number[] }) {
  const read = useQuoteReader(2000)
  const [all, setAll] = useState(false)
  const index = getInstrument(indexId)!
  const rows = useMemo(() => {
    const members = ids ? ids.flatMap((id) => getInstrument(id) ?? []) : membersOf(indexId)
    const prevOf = (id: number, fallback: number) => read(id)?.prevClose ?? fallback
    const total = members.reduce((s, e) => s + marketCapCr(e, prevOf(e.id, e.prevClose)), 0)
    const level = prevOf(indexId, index.prevClose)
    return members
      .map((inst) => {
        const q = read(inst.id)
        const weight = marketCapCr(inst, prevOf(inst.id, inst.prevClose)) / total
        const pct = q?.changePct ?? 0
        return { inst, weight: weight * 100, pct, points: weight * (pct / 100) * level }
      })
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
  }, [read, indexId, ids, index.prevClose])
  const max = Math.max(...rows.map((r) => Math.abs(r.points)), 0.01)
  const shown = all ? rows : rows.slice(0, FIRST)

  return (
    <div>
      <ol className="-my-2 divide-y divide-rule">
        {shown.map((r) => (
          <li key={r.inst.id}>
            <Link href={hrefOf(r.inst)} className="group grid grid-cols-[30px_minmax(0,1fr)_4rem_minmax(3rem,1.3fr)_5rem] items-center gap-3 py-2">
              <Monogram text={r.inst.symbol} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold decoration-rule-strong underline-offset-4 group-hover:underline">{r.inst.name}</span>
                <span className="num block text-xs text-ink-3">{formatNumber(r.weight, 1)}% of the index</span>
              </span>
              <span className="flex justify-end">
                <Move value={r.pct} />
              </span>
              <span className="relative h-2" aria-hidden="true">
                <span className="absolute -inset-y-1 left-1/2 w-px bg-rule-strong" />
                <span
                  className={cn("absolute inset-y-0 rounded-[3px]", r.points >= 0 ? "left-1/2 bg-up" : "right-1/2 bg-down")}
                  style={{ width: `${(Math.abs(r.points) / max) * 50}%` }}
                />
              </span>
              <span className={cn("num text-right text-[13px] font-semibold", r.points >= 0 ? "text-up" : "text-down")}>{formatSigned(r.points, 1)} pts</span>
            </Link>
          </li>
        ))}
      </ol>
      {rows.length > shown.length && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <button type="button" onClick={() => setAll(true)} className="font-semibold text-ink-2 hover:text-ink">
            Show all {rows.length}
          </button>
          <span className="text-ink-3">The {FIRST} adding or taking off the most points</span>
        </p>
      )}
    </div>
  )
}
