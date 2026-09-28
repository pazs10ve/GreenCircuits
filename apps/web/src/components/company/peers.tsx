"use client"

import Link from "next/link"
import { LivePrice } from "@/components/market/price"
import { formatCrore, formatNumber, formatPct } from "@greencircuits/market/format"
import { useMarket } from "@/lib/stream/market-context"
import { cn } from "@/lib/utils"
import { LiveMove } from "@/components/parts/live-move"
import { Monogram } from "@/components/parts/monogram"
import { Move } from "@/components/parts/move"

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
  const { dataset } = useMarket()
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-rule text-xs text-ink-3">
            <th scope="col" className="pb-2 text-left font-normal">
              Company
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Price
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Day
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
              <tr key={r.id} className={cn("border-b border-rule last:border-0", current && "bg-panel")}>
                <th scope="row" className="py-2.5 pr-4 pl-2 text-left font-normal">
                  <span className="flex items-center gap-2.5">
                    <Monogram text={r.slug} size={28} />
                    {current ? (
                      <span className="font-semibold">{r.name}</span>
                    ) : (
                      <Link href={`/stocks/${r.slug}`} className="font-medium decoration-rule-strong underline-offset-4 hover:underline">
                        {r.name}
                      </Link>
                    )}
                  </span>
                </th>
                <td className="py-2.5 text-right">
                  <LivePrice id={r.id} />
                </td>
                <td className="py-2.5 text-right">
                  <LiveMove id={r.id} />
                </td>
                <td className="num py-2.5 text-right">{formatCrore(r.mcapCr)}</td>
                <td className="num py-2.5 text-right">{formatNumber(r.pe, 1)}</td>
                <td className="num py-2.5 text-right">{formatNumber(r.roe, 0)}%</td>
                <td className="num py-2.5 text-right">{formatPct(r.growth, 0)}</td>
                <td className="py-2.5 pr-2 text-right">
                  <Move value={r.return1y} digits={0} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-3">Profit growth is the three-year annual rate.{dataset === "real" ? "" : " Sample figures."}</p>
    </div>
  )
}
