"use client"

import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { formatCrore } from "@greencircuits/market/format"
import { DataTable } from "@/components/data/data-table"
import { Price } from "@/components/market/price"
import { Move } from "@/components/parts/move"
import { Sparkline } from "@/components/market/sparkline"
import { Button } from "@/components/ui/button"
import { InstrumentCell, MiniRange } from "@/components/stocks/cells"
import { withLive } from "@/components/stocks/derive"
import { normalise } from "@/lib/search"
import { useQuoteReader } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { cn } from "@/lib/utils"
import type { FundStatic } from "./data"

interface Row {
  inst: Instrument
  q: Quote | undefined
  spark: number[]
  low52: number
  high52: number
  /** The year's return in %, null without a year of prices. */
  year: number | null
  /** ₹ crore traded today. */
  traded: number
}

const KIND_NAMES: Record<string, string> = { REIT: "REIT", INVIT: "InvIT" }

function yearCell(value: number | null) {
  return <Move value={value} digits={1} />
}

function columnsFor(kind: "etf" | "trust"): ColumnDef<Row>[] {
  return [
    {
      id: "fund",
      header: kind === "etf" ? "ETF" : "Trust",
      accessorFn: (r) => r.inst.name,
      cell: ({ row }) => <InstrumentCell inst={row.original.inst} className="max-w-[300px]" />,
      meta: { sticky: true, className: "min-w-[220px]" },
    },
    {
      id: "ltp",
      header: "Price",
      accessorFn: (r) => r.q?.ltp ?? r.inst.prevClose,
      cell: ({ row }) => <Price value={row.original.q?.ltp} tick={row.original.inst.tick} />,
      meta: { align: "right" },
    },
    {
      id: "change",
      header: "Day",
      accessorFn: (r) => r.q?.changePct ?? 0,
      cell: ({ row }) => <Move value={row.original.q?.changePct} />,
      meta: { align: "right" },
    },
    {
      id: "year",
      header: "1 year",
      accessorFn: (r) => r.year ?? undefined,
      sortUndefined: "last",
      cell: ({ row }) => yearCell(row.original.year),
      meta: { align: "right" },
    },
    {
      id: "trend",
      header: "30 days",
      cell: ({ row }) => <Sparkline data={row.original.spark} width={84} height={24} className="h-6 w-[84px]" />,
      meta: { className: "w-[108px]" },
    },
    {
      id: "range",
      header: "52-week range",
      accessorFn: (r) => ((r.q?.ltp ?? r.inst.prevClose) - r.low52) / Math.max(r.high52 - r.low52, 1e-9),
      cell: ({ row }) => {
        const r = row.original
        return <MiniRange low={r.low52} high={r.high52} value={r.q?.ltp} tick={r.inst.tick} label="52-week range" />
      },
    },
    kind === "etf"
      ? {
          id: "tracks",
          header: "Follows",
          accessorFn: (r) => r.inst.underlying ?? "",
          cell: ({ row }) => <span className="block max-w-[180px] truncate text-ink-2">{row.original.inst.underlying ?? "–"}</span>,
        }
      : {
          id: "kind",
          header: "Kind",
          accessorFn: (r) => r.inst.kind,
          cell: ({ row }) => <span className="text-ink-2">{KIND_NAMES[row.original.inst.kind]}</span>,
        },
    {
      id: "traded",
      header: "Traded today",
      accessorFn: (r) => r.traded,
      cell: ({ row }) => (row.original.q ? formatCrore(row.original.traded) : <span className="text-ink-3">–</span>),
      meta: { align: "right" },
    },
  ]
}

/** ETFs, or REITs and InvITs, with live prices, the year's return and how much changed hands today. */
export function ListedTable({
  kind,
  funds,
  data,
  query,
  category,
  onClear,
}: {
  kind: "etf" | "trust"
  funds: Instrument[]
  data: FundStatic[]
  query: string
  category: string
  /** Offered when filters leave nothing to show. */
  onClear?: () => void
}) {
  const read = useQuoteReader(1000)
  const { dataset } = useMarket()
  const statics = useMemo(() => new Map(data.map((d) => [d.id, d])), [data])
  const columns = useMemo(() => columnsFor(kind), [kind])

  const rows = useMemo(() => {
    const needle = normalise(query)
    const out: Row[] = []
    for (const inst of funds) {
      if (category !== "all" && inst.category !== category) continue
      if (needle && !normalise(`${inst.symbol} ${inst.name} ${inst.underlying ?? ""}`).includes(needle)) continue
      const s = statics.get(inst.id)
      if (!s) continue
      const q = read(inst.id)
      const ltp = q?.ltp ?? inst.prevClose
      out.push({
        inst,
        q,
        spark: withLive(s.spark, q?.ltp, dataset === "real"),
        low52: q ? Math.min(s.low52, q.low) : s.low52,
        high52: q ? Math.max(s.high52, q.high) : s.high52,
        year: s.yearAgo ? (ltp / s.yearAgo - 1) * 100 : null,
        traded: q ? (q.volume * ltp) / 1e7 : 0,
      })
    }
    return out
  }, [funds, category, query, statics, read, dataset])

  const filtered = query.trim() !== "" || category !== "all"
  return (
    <div className="flex flex-col">
      <DataTable
        columns={columns}
        data={rows}
        initialSorting={[{ id: "traded", desc: true }]}
        getRowId={(r) => String(r.inst.id)}
        getRowHref={(r) => `/funds/${r.inst.slug}`}
        noun="funds"
        empty={
          <span className="inline-flex flex-wrap items-center justify-center gap-1">
            Nothing matches{query.trim() && <span className="font-medium text-ink">“{query.trim()}”</span>}
            {category !== "all" && <span>among {category.toLowerCase()} ETFs</span>}.
            {onClear && (
              <Button variant="link" size="sm" className="h-auto px-1" onClick={onClear}>
                Clear the filters
              </Button>
            )}
          </span>
        }
      />
      <p className={cn("mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm text-ink-3")}>
        <span className="num">
          {rows.length} of {funds.length}
          {filtered ? " match" : ""}
        </span>
        <span>{dataset === "real" ? "Prices via Yahoo Finance; today's value traded from the feed's volume." : "Prices are simulated; ETFs that track an index, gold or silver move with it."}</span>
      </p>
    </div>
  )
}
