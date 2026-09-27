"use client"

import Link from "next/link"
import { useMemo } from "react"
import { getInstrument, marketCapCr, membersOf } from "@greencircuits/market/catalog"
import { formatNumber, formatPct, formatSigned } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { cn } from "@/lib/utils"

/**
 * An index's members ranked by how many points each is adding or taking off
 * today, weighted by market value at yesterday's close. `members` are the ids
 * the API has; without them, the demo universe's membership.
 */
export function Constituents({ indexId, members: ids }: { indexId: number; members?: number[] }) {
  const read = useQuoteReader(2000)
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

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-ink text-xs text-ink-3">
            <th scope="col" className="pb-2 text-left font-normal">
              Company
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Weight
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Day
            </th>
            <th scope="col" className="w-[40%] pb-2 pl-6 text-left font-normal">
              Index points
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.inst.id} className="border-b border-rule">
              <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                <Link href={`/stocks/${r.inst.slug}`} className="hover:underline">
                  {r.inst.name}
                </Link>
              </th>
              <td className="num py-2.5 text-right text-ink-2">{formatNumber(r.weight, 1)}%</td>
              <td className={cn("num py-2.5 text-right", r.pct > 0 ? "text-up" : r.pct < 0 ? "text-down" : "text-ink-2")}>{formatPct(r.pct)}</td>
              <td className="py-2.5 pl-6">
                <span className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-3">
                  <span className="relative h-2">
                    <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink-3/50" />
                    <span
                      className={cn("absolute inset-y-0 rounded-[2px]", r.points >= 0 ? "left-1/2 bg-up/75" : "right-1/2 bg-down/75")}
                      style={{ width: `${(Math.abs(r.points) / max) * 50}%` }}
                    />
                  </span>
                  <span className={cn("num text-right", r.points >= 0 ? "text-up" : "text-down")}>{formatSigned(r.points, 1)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
