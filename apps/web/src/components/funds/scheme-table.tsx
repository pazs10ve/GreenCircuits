"use client"

import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import { formatNumber } from "@greencircuits/market/format"
import { DataTable } from "@/components/data/data-table"
import { Monogram } from "@/components/parts/monogram"
import { Move } from "@/components/parts/move"
import type { SchemeRow } from "@/lib/data/funds"

function returnCell(value: number | null) {
  return <Move value={value} digits={1} />
}

function returnColumn(id: "y1" | "y3" | "y5" | "y10", header: string): ColumnDef<SchemeRow> {
  return {
    id,
    header,
    accessorFn: (r) => r[id] ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => returnCell(row.original[id]),
    meta: { align: "right" },
  }
}

const columns: ColumnDef<SchemeRow>[] = [
  {
    id: "fund",
    header: "Fund",
    accessorFn: (r) => r.name,
    cell: ({ row }) => (
      <Link href={`/funds/${row.original.code}`} className="group/link flex max-w-[380px] min-w-0 items-center gap-2.5 leading-snug">
        <Monogram text={row.original.amc} size={28} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-ink decoration-rule-strong group-hover/link:underline group-hover/link:underline-offset-4">{row.original.name}</span>
          <span className="truncate text-xs text-ink-3">{row.original.amc}</span>
        </span>
      </Link>
    ),
    meta: { sticky: true, className: "min-w-[240px]" },
  },
  {
    id: "nav",
    header: "NAV",
    accessorFn: (r) => r.nav ?? undefined,
    cell: ({ row }) => (row.original.nav == null ? <span className="text-ink-3">–</span> : `₹${formatNumber(row.original.nav, 2)}`),
    meta: { align: "right" },
  },
  returnColumn("y1", "1 year"),
  returnColumn("y3", "3 years, a year"),
  returnColumn("y5", "5 years, a year"),
  returnColumn("y10", "10 years, a year"),
]

/** A category's schemes and their returns: a year's change, then annualised over longer spans. */
export function SchemeTable({ schemes }: { schemes: SchemeRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={schemes}
      initialSorting={[{ id: "y5", desc: true }]}
      getRowId={(r) => String(r.code)}
      getRowHref={(r) => `/funds/${r.code}`}
      noun="schemes"
      empty="No schemes in this category."
    />
  )
}
