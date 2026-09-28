"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { formatDateIST, formatNumber } from "@greencircuits/market/format"
import { DataTable } from "@/components/data/data-table"
import { Move } from "@/components/parts/move"
import type { BondRow } from "./bond-math"

interface Row {
  bond: BondRow
  /** Change in price since issue, in %. */
  sinceIssue: number | null
  /** The 2.5% interest on the issue price, as a share of today's price. */
  interestYield: number | null
}

const columns: ColumnDef<Row>[] = [
  {
    id: "name",
    header: "Bond",
    accessorFn: (r) => r.bond.name,
    cell: ({ row }) => <span className="font-semibold text-ink">{row.original.bond.name}</span>,
    meta: { sticky: true, className: "min-w-40" },
  },
  {
    id: "maturity",
    header: "Matures",
    accessorFn: (r) => r.bond.maturity.getTime(),
    cell: ({ row }) => (
      <span className="block leading-snug">
        <span className="block">{formatDateIST(row.original.bond.maturity)}</span>
        <span className="block text-[13px] text-ink-3">{formatNumber(row.original.bond.yearsLeft, 1)} yrs</span>
      </span>
    ),
    meta: { align: "right" },
  },
  {
    id: "issue",
    header: "Issued at",
    accessorFn: (r) => r.bond.issuePrice ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (row.original.bond.issuePrice ? `₹${formatNumber(row.original.bond.issuePrice, 0)}` : "–"),
    meta: { align: "right" },
  },
  {
    id: "price",
    header: "Price a gram",
    accessorFn: (r) => r.bond.price ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => {
      const { price, fresh } = row.original.bond
      if (price == null) return <span className="text-ink-3">–</span>
      return <span className={fresh ? undefined : "text-ink-3"} title={fresh ? undefined : "Last traded before today"}>₹{formatNumber(price, 2)}</span>
    },
    meta: { align: "right" },
  },
  {
    id: "since",
    header: "Since issue",
    accessorFn: (r) => r.sinceIssue ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => {
      const v = row.original.sinceIssue
      return <Move value={v} digits={0} />
    },
    meta: { align: "right" },
  },
  {
    id: "interest",
    header: "Interest on today's price",
    accessorFn: (r) => r.interestYield ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (row.original.interestYield == null ? <span className="text-ink-3">–</span> : `${formatNumber(row.original.interestYield, 2)}%`),
    meta: { align: "right" },
  },
]

/** Gold bonds: what each cost at issue, what it trades at now, and what its fixed interest pays on that. */
export function GoldBonds({ bonds, real }: { bonds: BondRow[]; real: boolean }) {
  const rows: Row[] = bonds.map((bond) => ({
    bond,
    sinceIssue: bond.price && bond.issuePrice ? (bond.price / bond.issuePrice - 1) * 100 : null,
    interestYield: bond.price && bond.issuePrice ? (2.5 * bond.issuePrice) / bond.price : null,
  }))
  return (
    <div>
      <DataTable columns={columns} data={rows} initialSorting={[{ id: "maturity", desc: false }]} getRowId={(r) => r.bond.id} noun="bonds" />
      <p className="mt-3 text-xs text-ink-3">
        {real
          ? "Prices from the NSE; a grey price is one from before today. Maturity is taken as the middle of the month the bond's name gives."
          : "Sample data."}{" "}
        The government has issued no new gold bonds since February 2024.
      </p>
    </div>
  )
}
