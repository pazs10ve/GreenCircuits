"use client"

import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { expiriesFor, isMonthly } from "@greencircuits/market/chain"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { formatCompact, formatNumber } from "@greencircuits/market/format"
import { DataTable } from "@/components/data/data-table"
import { Price } from "@/components/market/price"
import { Monogram } from "@/components/parts/monogram"
import { Move } from "@/components/parts/move"
import { Skeleton } from "@/components/ui/skeleton"
import { useNow } from "@/hooks/use-now"
import { useQuoteReader } from "@/lib/stream/hooks"
import { FO_UNDERLYINGS, hasWeeklies } from "./chain-model"
import { ExpiryTag } from "./index-underlyings"

interface Row {
  inst: Instrument
  q: Quote | undefined
  expiry: Date | undefined
  lot: number
}

/** The stocks with options: price, the day's move, the next expiry and what one lot is worth. */
export function UnderlyingsTable() {
  const read = useQuoteReader(1000)
  // Expiries depend on the date, so they wait for the browser's clock.
  const now = useNow(60_000)

  const rows = useMemo<Row[]>(
    () =>
      FO_UNDERLYINGS.filter((inst) => inst.kind !== "INDEX").map((inst) => ({
        inst,
        q: read(inst.id),
        expiry: now ? expiriesFor(inst, now, 1)[0] : undefined,
        lot: inst.lot ?? 1,
      })),
    [read, now],
  )

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "name",
        header: "Company",
        accessorFn: (r) => r.inst.name,
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2.5 leading-snug">
            <Monogram text={row.original.inst.symbol} size={28} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-semibold text-ink">{row.original.inst.name}</span>
              <span className="truncate text-xs text-ink-3">{row.original.inst.symbol}</span>
            </span>
          </span>
        ),
        meta: { sticky: true, className: "min-w-[190px]" },
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
        cell: ({ row }) => <Move value={row.original.q?.changePct} />,
        meta: { align: "right" },
      },
      {
        id: "expiry",
        header: "Next expiry",
        accessorFn: (r) => r.expiry?.getTime() ?? 0,
        cell: ({ row }) => {
          const { expiry, inst } = row.original
          if (!expiry || !now) return <Skeleton className="h-4 w-28" />
          return (
            <span className="inline-flex items-center gap-1.5">
              <ExpiryTag expiry={expiry} now={now} />
              <span className="text-xs text-ink-3">{hasWeeklies(inst) && !isMonthly(expiry, inst) ? "weekly" : "monthly"}</span>
            </span>
          )
        },
      },
      {
        id: "lot",
        header: "Lot",
        accessorFn: (r) => r.lot,
        cell: ({ row }) => <span className="text-ink-2">{formatNumber(row.original.lot, 0)}</span>,
        meta: { align: "right" },
      },
      {
        id: "value",
        header: "One lot is worth",
        accessorFn: (r) => (r.q?.ltp ?? 0) * r.lot,
        cell: ({ row }) => {
          const { q, lot } = row.original
          return q ? <span>₹{formatCompact(q.ltp * lot, 2)}</span> : <Skeleton className="ml-auto h-4 w-16" />
        },
        meta: { align: "right" },
      },
    ],
    [now],
  )

  return <DataTable columns={columns} data={rows} getRowId={(r) => String(r.inst.id)} getRowHref={(r) => `/fo/${r.inst.slug}`} noun="underlyings" />
}
