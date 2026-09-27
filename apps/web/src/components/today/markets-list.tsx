"use client"

import Link from "next/link"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import { LiveChange, LivePrice } from "@/components/market/price"

const ROWS = [
  { id: INDEX.NIFTY, name: "Nifty 50" },
  { id: INDEX.SENSEX, name: "Sensex" },
  { id: INDEX.BANKNIFTY, name: "Nifty Bank" },
  { id: INDEX.MIDCAP, name: "Nifty Midcap 100" },
  { id: INDEX.NIFTYIT, name: "Nifty IT" },
  { id: INDEX.VIX, name: "India VIX", note: "volatility" },
  { id: 400, name: "Rupee", note: "per US dollar" },
  { id: 300, name: "Gold", note: "₹ per 10 g" },
]

/** The markets box: the numbers a reader checks first, in a plain list. */
export function MarketsList() {
  return (
    <div>
      <h2 className="border-b border-ink pb-2 text-sm font-semibold">Markets</h2>
      <ul>
        {ROWS.map((r) => {
          const inst = getInstrument(r.id)!
          const href = inst.kind === "COMMODITY" ? `/commodities?c=${inst.slug}` : `/stocks/${inst.slug}`
          return (
            <li key={r.id} className="border-b border-rule">
              <Link href={href} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-2.5 hover:bg-surface/60">
                <span className="min-w-0">
                  <span className="block truncate text-[0.9375rem]">{r.name}</span>
                  {r.note && <span className="block text-xs text-ink-3">{r.note}</span>}
                </span>
                <span className="text-right">
                  <LivePrice id={r.id} className="block text-[0.9375rem]" />
                  <LiveChange id={r.id} showAbsolute={false} className="text-[13px]" />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
