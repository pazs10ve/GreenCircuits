"use client"

import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { EQUITIES, marketCapCr } from "@greencircuits/market/catalog"
import type { Instrument, Quote, Sector } from "@greencircuits/market/types"
import { formatCompact, formatCrore, formatNumber } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { DataTable } from "@/components/data/data-table"
import { ChangePill, Price } from "@/components/market/price"
import { Sparkline } from "@/components/market/sparkline"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { InstrumentCell, MiniRange } from "./cells"
import type { StockStatic } from "./derive"

interface Row {
  inst: Instrument
  q: Quote | undefined
  spark: number[]
  low52: number
  high52: number
  ltp: number
  mcap: number
  pe: number | null
  /** Position in the 52-week range, 0–1. */
  pos52: number
  relVol: number | undefined
}

/** Lower-case letters and digits only, so "m&m", "M & M" and "bajaj auto" all match. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "")
}

const columns: ColumnDef<Row>[] = [
  {
    id: "stock",
    header: "Stock",
    accessorFn: (r) => r.inst.symbol,
    cell: ({ row }) => <InstrumentCell inst={row.original.inst} />,
    meta: { sticky: true, className: "min-w-[150px]" },
  },
  {
    id: "ltp",
    header: "LTP",
    accessorFn: (r) => r.ltp,
    cell: ({ row }) => <Price value={row.original.q?.ltp} tick={row.original.inst.tick} />,
    meta: { align: "right" },
  },
  {
    id: "change",
    header: "Change",
    accessorFn: (r) => r.q?.changePct ?? 0,
    cell: ({ row }) => <ChangePill pct={row.original.q?.changePct} />,
    meta: { align: "right" },
  },
  {
    id: "trend",
    header: "30D",
    cell: ({ row }) => <Sparkline data={row.original.spark} width={84} height={24} className="h-6 w-[84px]" />,
    meta: { className: "w-[108px]" },
  },
  {
    id: "mcap",
    header: "Market cap",
    accessorFn: (r) => r.mcap,
    cell: ({ row }) => formatCrore(row.original.mcap),
    meta: { align: "right" },
  },
  {
    id: "pe",
    header: "P/E",
    accessorFn: (r) => r.pe,
    cell: ({ row }) => (row.original.pe == null ? <span className="text-muted-foreground">–</span> : formatNumber(row.original.pe, 1)),
    meta: { align: "right" },
  },
  {
    id: "range",
    header: "52W range",
    accessorFn: (r) => r.pos52,
    cell: ({ row }) => {
      const r = row.original
      return <MiniRange low={r.low52} high={r.high52} value={r.q?.ltp} tick={r.inst.tick} label="52-week range" />
    },
  },
  {
    id: "volume",
    header: "Vol / avg",
    accessorFn: (r) => r.relVol ?? 0,
    cell: ({ row }) => {
      const { q, relVol } = row.original
      if (!q || relVol == null) return <Skeleton className="ml-auto h-6 w-14" />
      return (
        <span className="flex flex-col items-end leading-tight">
          <span>{formatCompact(q.volume)}</span>
          <span className="text-[10px] text-muted-foreground">{formatNumber(relVol, 2)}× avg</span>
        </span>
      )
    },
    meta: { align: "right" },
  },
  {
    id: "sector",
    header: "Sector",
    accessorFn: (r) => r.inst.sector,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.inst.sector}</span>,
  },
]

/** Every stock in the universe with live price, valuation and 52-week position. */
export function StocksTable({
  data,
  query,
  sector,
  onClear,
}: {
  data: StockStatic[]
  query: string
  sector: Sector | "all"
  onClear: () => void
}) {
  const read = useQuoteReader(1000)
  const statics = useMemo(() => new Map(data.map((d) => [d.id, d])), [data])

  const rows = useMemo(() => {
    const needle = normalise(query)
    const out: Row[] = []
    for (const inst of EQUITIES) {
      if (sector !== "all" && inst.sector !== sector) continue
      if (needle && !normalise(inst.symbol).includes(needle) && !normalise(inst.name).includes(needle)) continue
      const s = statics.get(inst.id)
      if (!s) continue
      const q = read(inst.id)
      const ltp = q?.ltp ?? inst.prevClose
      const low52 = q ? Math.min(s.low52, q.low) : s.low52
      const high52 = q ? Math.max(s.high52, q.high) : s.high52
      out.push({
        inst,
        q,
        spark: q ? [...s.spark, q.ltp] : s.spark,
        low52,
        high52,
        ltp,
        mcap: marketCapCr(inst, ltp),
        // A loss makes the P/E meaningless rather than negative.
        pe: s.eps != null && s.eps > 0 ? ltp / s.eps : null,
        pos52: (ltp - low52) / Math.max(high52 - low52, 1e-9),
        relVol: q ? q.volume / inst.avgVolume : undefined,
      })
    }
    return out
  }, [read, statics, query, sector])

  const filtered = query.trim() !== "" || sector !== "all"

  return (
    <div className="flex flex-col">
      <DataTable
        columns={columns}
        data={rows}
        initialSorting={[{ id: "mcap", desc: true }]}
        getRowId={(r) => String(r.inst.id)}
        getRowHref={(r) => `/stocks/${r.inst.slug}`}
        maxHeight="min(72vh, 780px)"
        empty={
          <span className="inline-flex flex-wrap items-center justify-center gap-1">
            No stocks match
            {query.trim() && <span className="font-medium text-foreground">“{query.trim()}”</span>}
            {sector !== "all" && <span>in {sector}</span>}.
            <Button variant="link" size="sm" className="h-auto px-1" onClick={onClear}>
              Clear filters
            </Button>
          </span>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
        <span className="num">
          {rows.length} of {EQUITIES.length} stocks{filtered ? " match" : ""}
        </span>
        <span>Market cap and P/E combine the live price with sample shares and earnings.</span>
      </div>
    </div>
  )
}
