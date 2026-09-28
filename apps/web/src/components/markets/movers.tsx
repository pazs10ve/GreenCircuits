"use client"

import { useMemo } from "react"
import { getInstrument, hrefOf } from "@greencircuits/market/catalog"
import { formatNumber, formatPrice } from "@greencircuits/market/format"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { useQuoteReader } from "@/lib/stream/hooks"
import { InstrumentRow } from "@/components/parts/instrument-row"
import { Move } from "@/components/parts/move"
import { Tag } from "@/components/parts/tag"

const SHOWN = 8

interface Mover {
  inst: Instrument
  q: Quote
  /** Today's volume against the usual day's. */
  busy: number
}

function List({ title, rows, figure }: { title: string; rows: Mover[]; figure: (m: Mover) => React.ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className="text-xs font-semibold text-ink-3">{title}</h3>
      <div className="mt-1 divide-y divide-rule">
        {rows.map((m) => (
          <InstrumentRow
            key={m.inst.id}
            href={hrefOf(m.inst)}
            mono={m.inst.symbol}
            name={m.inst.name}
            sub={m.inst.symbol}
            value={formatPrice(m.q.ltp, m.inst.tick)}
            move={figure(m)}
          />
        ))}
      </div>
    </section>
  )
}

/** The Nifty 500's biggest risers and fallers today, and the stocks trading far more than usual. */
export function Movers({ ids }: { ids: number[] }) {
  const read = useQuoteReader(3000)
  const lists = useMemo(() => {
    const rows = ids.flatMap((id) => {
      const inst = getInstrument(id)
      const q = read(id)
      return inst && q ? [{ inst, q, busy: inst.avgVolume ? q.volume / inst.avgVolume : 0 }] : []
    })
    return {
      gainers: [...rows].sort((a, b) => b.q.changePct - a.q.changePct).slice(0, SHOWN),
      losers: [...rows].sort((a, b) => a.q.changePct - b.q.changePct).slice(0, SHOWN),
      busy: [...rows].sort((a, b) => b.busy - a.busy).slice(0, SHOWN),
    }
  }, [ids, read])

  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
      <List title="Rising most" rows={lists.gainers} figure={(m) => <Move value={m.q.changePct} />} />
      <List title="Falling most" rows={lists.losers} figure={(m) => <Move value={m.q.changePct} />} />
      <List title="Busiest, against a usual day" rows={lists.busy} figure={(m) => <Tag>{formatNumber(m.busy, 1)}×</Tag>} />
    </div>
  )
}
