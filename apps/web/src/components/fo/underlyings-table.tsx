"use client"

import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { expiriesFor, isMonthly } from "@greencircuits/market/chain"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { formatCompact, formatNumber } from "@greencircuits/market/format"
import { DataTable } from "@/components/data/data-table"
import { DayChange, Price } from "@/components/market/price"
import { Skeleton } from "@/components/ui/skeleton"
import { useNow } from "@/hooks/use-now"
import { useQuoteReader } from "@/lib/stream/hooks"
import { FO_UNDERLYINGS, formatExpiry, hasWeeklies } from "./chain-model"

interface Row {
  inst: Instrument
  q: Quote | undefined
  expiry: Date | undefined
  lot: number
}

const DAY = 86_400_000

function untilWords(expiry: Date, now: Date): string {
  const days = Math.round((Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY)
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`
}

/** Every underlying with options: its price, the next expiry and what one lot is worth. */
export function UnderlyingsTable() {
  const read = useQuoteReader(1000)
  // Expiries depend on the date, so they wait for the browser's clock.
  const now = useNow(60_000)

  const rows = useMemo<Row[]>(
    () =>
      FO_UNDERLYINGS.map((inst) => ({
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
        header: "Underlying",
        accessorFn: (r) => r.inst.name,
        cell: ({ row }) => (
          <span className="flex flex-col leading-snug">
            <span className="font-medium text-ink">{row.original.inst.name}</span>
            <span className="text-[13px] text-ink-3">
              {row.original.inst.kind === "INDEX" ? "Index" : "Stock"} · {row.original.inst.exchange}
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
        cell: ({ row }) => <DayChange pct={row.original.q?.changePct} />,
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
            <span className="flex flex-col leading-snug">
              <span>{formatExpiry(expiry, true)}</span>
              <span className="text-[13px] text-ink-3">
                {untilWords(expiry, now)} · {hasWeeklies(inst) && !isMonthly(expiry, inst) ? "weekly" : "monthly"}
              </span>
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

  return <DataTable columns={columns} data={rows} getRowId={(r) => String(r.inst.id)} getRowHref={(r) => `/fo/${r.inst.slug}`} />
}
