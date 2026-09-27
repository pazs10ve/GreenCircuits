"use client"

import Link from "next/link"
import { LiveChange, LivePrice } from "@/components/market/price"
import { formatCrore, formatNumber, formatPct } from "@greencircuits/market/format"
import { cn } from "@/lib/utils"

export interface PeerRow {
  id: number
  slug: string
  name: string
  mcapCr: number
  pe: number
  roe: number
  growth: number
  return1y: number
}

/** The company against the largest companies in its sector, on the numbers that matter most. */
export function Peers({ rows, currentId }: { rows: PeerRow[]; currentId: number }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-ink text-xs text-ink-3">
            <th scope="col" className="pb-2 text-left font-normal">
              Company
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Price
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Today
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Market value
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              P/E
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Return on equity
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Profit growth
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              1-year return
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const current = r.id === currentId
            return (
              <tr key={r.id} className={cn("border-b border-rule", current && "bg-surface/70")}>
                <th scope="row" className="py-3 pr-4 text-left font-normal">
                  {current ? (
                    <span className="font-semibold">{r.name}</span>
                  ) : (
                    <Link href={`/stocks/${r.slug}`} className="hover:underline">
                      {r.name}
                    </Link>
                  )}
                </th>
                <td className="py-3 text-right">
                  <LivePrice id={r.id} />
                </td>
                <td className="py-3 text-right">
                  <LiveChange id={r.id} showAbsolute={false} />
                </td>
                <td className="num py-3 text-right">{formatCrore(r.mcapCr)}</td>
                <td className="num py-3 text-right">{formatNumber(r.pe, 1)}</td>
                <td className="num py-3 text-right">{formatNumber(r.roe, 0)}%</td>
                <td className="num py-3 text-right">{formatPct(r.growth, 0)}</td>
                <td className={cn("num py-3 text-right", r.return1y >= 0 ? "text-up" : "text-down")}>{formatPct(r.return1y, 0)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-3">Profit growth is the three-year annual rate. Sample figures.</p>
    </div>
  )
}
