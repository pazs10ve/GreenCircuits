"use client"

import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { EQUITIES, INDICES } from "@greencircuits/market/catalog"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { formatNumber } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { DataTable } from "@/components/data/data-table"
import { Change, Price } from "@/components/market/price"
import { Sparkline } from "@/components/market/sparkline"
import { InstrumentCell, MiniRange } from "./cells"
import type { IndexStatic } from "./derive"

interface Row {
  inst: Instrument
  q: Quote | undefined
  s: IndexStatic
  spark: number[]
  low52: number
  high52: number
}

const columns: ColumnDef<Row>[] = [
  {
    id: "index",
    header: "Index",
    accessorFn: (r) => r.inst.symbol,
    cell: ({ row }) => <InstrumentCell inst={row.original.inst} />,
    meta: { sticky: true, className: "min-w-[160px]" },
  },
  {
    id: "value",
    header: "Value",
    accessorFn: (r) => r.q?.ltp ?? r.inst.prevClose,
    cell: ({ row }) => <Price value={row.original.q?.ltp} tick={row.original.inst.tick} className="font-medium" />,
    meta: { align: "right" },
  },
  {
    id: "change",
    header: "Change",
    accessorFn: (r) => r.q?.changePct ?? 0,
    cell: ({ row }) => {
      const { q, inst } = row.original
      return <Change change={q?.change} pct={q?.changePct} tick={inst.tick} className="justify-end" />
    },
    meta: { align: "right" },
  },
  {
    id: "trend",
    header: "30D",
    cell: ({ row }) => <Sparkline data={row.original.spark} width={96} height={26} className="h-[26px] w-24" />,
  },
  {
    id: "day",
    header: "Day range",
    accessorFn: (r) => (r.q ? (r.q.ltp - r.q.low) / Math.max(r.q.high - r.q.low, 1e-9) : 0),
    cell: ({ row }) => {
      const { q, inst } = row.original
      return <MiniRange low={q?.low} high={q?.high} value={q?.ltp} tick={inst.tick} label="Day range" className="w-28" />
    },
  },
  {
    id: "range",
    header: "52W range",
    accessorFn: (r) => ((r.q?.ltp ?? r.inst.prevClose) - r.low52) / Math.max(r.high52 - r.low52, 1e-9),
    cell: ({ row }) => {
      const r = row.original
      return <MiniRange low={r.low52} high={r.high52} value={r.q?.ltp} tick={r.inst.tick} label="52-week range" className="w-28" />
    },
  },
  {
    id: "members",
    header: "Members",
    accessorFn: (r) => r.s.members,
    cell: ({ row }) =>
      row.original.s.members > 0 ? (
        <span title="Members among the stocks this site follows">{row.original.s.members}</span>
      ) : (
        <span className="text-muted-foreground">–</span>
      ),
    meta: { align: "right" },
  },
  {
    id: "lot",
    header: "F&O lot",
    accessorFn: (r) => r.s.lot ?? 0,
    cell: ({ row }) =>
      row.original.s.lot ? formatNumber(row.original.s.lot, 0) : <span className="text-muted-foreground">–</span>,
    meta: { align: "right" },
  },
  {
    id: "exchange",
    header: "Exchange",
    accessorFn: (r) => r.inst.exchange,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.inst.exchange}</span>,
  },
]

/** All indices with live levels, trend and where they sit in their ranges. */
export function IndicesTable({ data }: { data: IndexStatic[] }) {
  const { dataset } = useMarket()
  const read = useQuoteReader(1000)
  const statics = useMemo(() => new Map(data.map((d) => [d.id, d])), [data])

  const rows = useMemo(() => {
    const out: Row[] = []
    for (const inst of INDICES) {
      const s = statics.get(inst.id)
      if (!s) continue
      const q = read(inst.id)
      out.push({
        inst,
        q,
        s,
        spark: q ? [...s.spark, q.ltp] : s.spark,
        low52: q ? Math.min(s.low52, q.low) : s.low52,
        high52: q ? Math.max(s.high52, q.high) : s.high52,
      })
    }
    return out
  }, [read, statics])

  return (
    <div className="flex flex-col">
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => String(r.inst.id)}
        getRowHref={(r) => `/stocks/${r.inst.slug}`}
      />
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        {dataset === "real"
          ? `Members counts only constituents among the ${EQUITIES.length} stocks this site follows.`
          : `Members counts only constituents inside the simulated ${EQUITIES.length}-stock universe; where there are members, the simulator builds the index level from them.`}
      </p>
    </div>
  )
}
