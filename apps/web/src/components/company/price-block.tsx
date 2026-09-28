"use client"

import { getInstrument } from "@greencircuits/market/catalog"
import { formatPrice, formatSigned } from "@greencircuits/market/format"
import { Move } from "@/components/parts/move"
import { useQuote, useSession } from "@/lib/stream/hooks"
import { cn } from "@/lib/utils"

/** The price in a page's header, with the day's move beside it and the change in rupees (or points) under it. */
export function PriceBlock({ id, className }: { id: number; className?: string }) {
  const inst = getInstrument(id)!
  const q = useQuote(id)
  const { closed } = useSession()
  const currency = inst.kind === "INDEX" ? "" : "₹"
  return (
    <div className={cn("text-right", className)}>
      <div className="flex items-center justify-end gap-2.5">
        <span className="figure text-[1.75rem] leading-none md:text-[2.125rem]">
          {currency && <span className="mr-0.5 text-[0.6em] text-ink-3">{currency}</span>}
          {q ? formatPrice(q.ltp, inst.tick) : "–"}
        </span>
        <Move value={q?.changePct} size="md" />
      </div>
      <p className="mt-1.5 text-[13px] text-ink-3">
        {q && <span className={cn("num font-semibold", q.change >= 0 ? "text-up" : "text-down")}>{formatSigned(q.change, inst.tick < 0.01 ? 4 : 2)}</span>} {closed ? `at the close, ${closed}` : "today"}
      </p>
    </div>
  )
}
