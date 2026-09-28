"use client"

import { INDEX, getInstrument, hrefOf } from "@greencircuits/market/catalog"
import { InstrumentRow } from "@/components/parts/instrument-row"
import { LiveMove } from "@/components/parts/live-move"
import { LivePrice } from "@/components/market/price"
import { Sparkline } from "@/components/market/sparkline"

const ROWS: { id: number; name: string; note?: string }[] = [
  { id: INDEX.SENSEX, name: "Sensex" },
  { id: INDEX.BANKNIFTY, name: "Bank Nifty" },
  { id: INDEX.NIFTYIT, name: "Nifty IT" },
  { id: INDEX.MIDCAP150, name: "Midcap 150" },
  { id: INDEX.SMALLCAP250, name: "Smallcap 250" },
  { id: 400, name: "Rupee", note: "₹ per US dollar" },
  { id: 300, name: "Gold", note: "₹ per 10 g" },
]

/** The numbers a reader checks after the Nifty: the other indices, the rupee and gold, each with its month. */
export function MarketsList({ sparks }: { sparks: Record<number, number[]> }) {
  return (
    <div className="-my-2.5 divide-y divide-rule">
      {ROWS.map((r) => {
        const inst = getInstrument(r.id)
        if (!inst) return null
        return (
          <InstrumentRow
            key={r.id}
            href={hrefOf(inst)}
            name={r.name}
            sub={r.note}
            trend={<Sparkline data={sparks[r.id] ?? []} width={64} height={22} />}
            value={<LivePrice id={r.id} />}
            move={<LiveMove id={r.id} />}
          />
        )
      })}
    </div>
  )
}
