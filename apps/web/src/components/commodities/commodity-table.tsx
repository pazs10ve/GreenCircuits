"use client"

import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { COMMODITIES } from "@greencircuits/market/catalog"
import { COMMODITY_GROUPS } from "@greencircuits/market/reference"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { formatNumber } from "@greencircuits/market/format"
import { DataTable } from "@/components/data/data-table"
import { DayChange, Price } from "@/components/market/price"
import { Sparkline } from "@/components/market/sparkline"
import { MiniRange } from "@/components/stocks/cells"
import { withLive } from "@/components/stocks/derive"
import { useQuoteReader } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { cn } from "@/lib/utils"
import { unitWords } from "./units"

export interface CommodityStatic {
  id: number
  spark: number[]
  low52: number
  high52: number
}

const GROUP = new Map(Object.entries(COMMODITY_GROUPS).flatMap(([group, symbols]) => symbols.map((s) => [s, group] as const)))
const ORDER = Object.values(COMMODITY_GROUPS).flat()

interface Row {
  inst: Instrument
  q: Quote | undefined
  s: CommodityStatic
  spark: number[]
}

/** Every commodity with its live price; picking a row shows it in full below. */
export function CommodityTable({ data, selected }: { data: CommodityStatic[]; selected: number }) {
  const read = useQuoteReader(1000)
  const { dataset } = useMarket()
  const statics = useMemo(() => new Map(data.map((d) => [d.id, d])), [data])

  const rows = useMemo(() => {
    const out: Row[] = []
    for (const inst of [...COMMODITIES].sort((a, b) => ORDER.indexOf(a.symbol) - ORDER.indexOf(b.symbol))) {
      const s = statics.get(inst.id)
      if (!s) continue
      const q = read(inst.id)
      out.push({ inst, q, s, spark: withLive(s.spark, q?.ltp, dataset === "real") })
    }
    return out
  }, [read, statics, dataset])

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "name",
        header: "Commodity",
        accessorFn: (r) => ORDER.indexOf(r.inst.symbol),
        cell: ({ row }) => (
          <span className="flex flex-col leading-snug">
            <span className={cn("text-ink", row.original.inst.id === selected ? "font-semibold" : "font-medium")}>{row.original.inst.name}</span>
            <span className="text-[13px] text-ink-3">
              {GROUP.get(row.original.inst.symbol)} · {unitWords(row.original.inst)}
            </span>
          </span>
        ),
        meta: { sticky: true, className: "min-w-[170px]" },
      },
      {
        id: "price",
        header: "Price",
        accessorFn: (r) => r.q?.ltp ?? 0,
        cell: ({ row }) => <Price value={row.original.q?.ltp} tick={row.original.inst.tick} />,
        meta: { align: "right" },
      },
      {
        id: "change",
        header: "Day",
        accessorFn: (r) => r.q?.changePct ?? 0,
        cell: ({ row }) => <DayChange pct={row.original.q?.changePct} />,
        meta: { align: "right" },
      },
      {
        id: "trend",
        header: "30 days",
        enableSorting: false,
        cell: ({ row }) => <Sparkline data={row.original.spark} width={84} height={24} className="h-6 w-[84px]" />,
        meta: { className: "w-[108px]" },
      },
      {
        id: "range",
        header: "52-week range",
        accessorFn: (r) => ((r.q?.ltp ?? r.s.low52) - r.s.low52) / Math.max(r.s.high52 - r.s.low52, 1e-9),
        cell: ({ row }) => {
          const r = row.original
          return <MiniRange low={Math.min(r.s.low52, r.q?.low ?? Infinity)} high={Math.max(r.s.high52, r.q?.high ?? 0)} value={r.q?.ltp} tick={r.inst.tick} label="52-week range" className="w-28" />
        },
      },
      {
        id: "lot",
        header: "MCX lot",
        accessorFn: (r) => r.inst.lot ?? 0,
        cell: ({ row }) => <span className="text-ink-2">{formatNumber(row.original.inst.lot ?? 0, 0)}</span>,
        meta: { align: "right" },
      },
    ],
    [selected],
  )

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => String(r.inst.id)}
      getRowHref={(r) => `/commodities?c=${r.inst.slug}#detail`}
      rowClassName={(row) => (row.original.inst.id === selected ? "[&>td]:bg-surface" : undefined)}
    />
  )
}
