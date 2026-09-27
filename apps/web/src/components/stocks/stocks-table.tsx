"use client"

import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { EQUITIES, marketCapCr } from "@greencircuits/market/catalog"
import type { Instrument, Quote, Sector } from "@greencircuits/market/types"
import { formatCompact, formatCrore, formatNumber } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { DataTable } from "@/components/data/data-table"
import { DayChange, Price } from "@/components/market/price"
import { Sparkline } from "@/components/market/sparkline"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { InstrumentCell, MiniRange } from "./cells"
import { withLive, type StockStatic } from "./derive"

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
    header: "Company",
    accessorFn: (r) => r.inst.name,
    cell: ({ row }) => <InstrumentCell inst={row.original.inst} />,
    meta: { sticky: true, className: "min-w-[200px]" },
  },
  {
    id: "ltp",
    header: "Price",
    accessorFn: (r) => r.ltp,
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
    cell: ({ row }) => <Sparkline data={row.original.spark} width={84} height={24} className="h-6 w-[84px]" />,
    meta: { className: "w-[108px]" },
  },
  {
    id: "mcap",
    header: "Market value",
    accessorFn: (r) => r.mcap,
    cell: ({ row }) => formatCrore(row.original.mcap),
    meta: { align: "right" },
  },
  {
    id: "pe",
    header: "P/E",
    accessorFn: (r) => r.pe,
    cell: ({ row }) => (row.original.pe == null ? <span className="text-ink-3">–</span> : formatNumber(row.original.pe, 1)),
    meta: { align: "right" },
  },
  {
    id: "range",
    header: "52-week range",
    accessorFn: (r) => r.pos52,
    cell: ({ row }) => {
      const r = row.original
      return <MiniRange low={r.low52} high={r.high52} value={r.q?.ltp} tick={r.inst.tick} label="52-week range" />
    },
  },
  {
    id: "volume",
    header: "Volume",
    accessorFn: (r) => r.relVol ?? 0,
    cell: ({ row }) => {
      const { q, relVol } = row.original
      if (!q || relVol == null) return <Skeleton className="ml-auto h-6 w-14" />
      return (
        <span className="flex flex-col items-end leading-snug">
          <span>{formatCompact(q.volume)}</span>
          <span className="text-[13px] text-ink-3">{formatNumber(relVol, 1)}× usual</span>
        </span>
      )
    },
    meta: { align: "right" },
  },
  {
    id: "sector",
    header: "Sector",
    accessorFn: (r) => r.inst.sector,
    cell: ({ row }) => <span className="text-ink-2">{row.original.inst.sector}</span>,
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
  const { dataset } = useMarket()
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
        spark: withLive(s.spark, q?.ltp, dataset === "real"),
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
  }, [read, statics, query, sector, dataset])

  const filtered = query.trim() !== "" || sector !== "all"

  return (
    <div className="flex flex-col">
      <DataTable
        columns={columns}
        data={rows}
        initialSorting={[{ id: "mcap", desc: true }]}
        getRowId={(r) => String(r.inst.id)}
        getRowHref={(r) => `/stocks/${r.inst.slug}`}
        empty={
          <span className="inline-flex flex-wrap items-center justify-center gap-1">
            No company matches
            {query.trim() && <span className="font-medium text-ink">“{query.trim()}”</span>}
            {sector !== "all" && <span>in {sector}</span>}.
            <Button variant="link" size="sm" className="h-auto px-1" onClick={onClear}>
              Clear the filters
            </Button>
          </span>
        }
      />
      <p className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm text-ink-3">
        <span className="num">
          {rows.length} of {EQUITIES.length} companies{filtered ? " match" : ""}
        </span>
        <span>
          {dataset === "real"
            ? "Market value and P/E use the live price with each company's shares and last twelve months' earnings."
            : "Market value and P/E combine the live price with sample shares and earnings."}
        </span>
      </p>
    </div>
  )
}
