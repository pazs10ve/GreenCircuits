"use client"

import Link from "next/link"
import type { ColumnDef } from "@tanstack/react-table"
import type { RunRow } from "@/lib/lab/runs"
import { formatPeriod } from "@/lib/lab/dates"
import { formatDuration } from "@/lib/lab/dsl"
import { formatDateIST, formatTimeIST } from "@greencircuits/market/format"
import { DataTable } from "@/components/data/data-table"
import { Progress } from "@/components/ui/progress"
import { RunStatusLabel, VersionTag } from "../badges"

function hrefFor(r: RunRow): string | undefined {
  if (r.status === "SUCCEEDED") return `/lab/backtests/${r.strategyId}`
  if (r.status === "RUNNING" || r.status === "QUEUED") return `/lab/backtests/${r.strategyId}?run=new`
  return undefined
}

const columns: ColumnDef<RunRow>[] = [
  {
    accessorKey: "id",
    header: "Run",
    cell: ({ row }) => {
      const href = hrefFor(row.original)
      const id = <span className="num font-mono text-[11px]">{row.original.id}</span>
      return href ? (
        <Link href={href} className="hover:text-primary hover:underline">
          {id}
        </Link>
      ) : (
        id
      )
    },
  },
  {
    accessorKey: "strategyName",
    header: "Strategy",
    cell: ({ row }) => (
      <span className="flex items-center gap-1.5">
        <span className="max-w-48 truncate font-medium">{row.original.strategyName}</span>
        <VersionTag version={row.original.version} />
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const r = row.original
      return (
        <span className="flex items-center gap-2">
          <RunStatusLabel status={r.status} />
          {r.status === "RUNNING" && r.progress != null && (
            <>
              <Progress value={r.progress} className="w-14" aria-label={`${r.progress}% complete`} />
              <span className="num text-[11px] text-muted-foreground">{r.progress}%</span>
            </>
          )}
          {r.status === "QUEUED" && r.position != null && <span className="num text-[11px] text-muted-foreground">position {r.position}</span>}
          {r.status === "FAILED" && r.error && (
            <span className="max-w-64 truncate text-[11px] text-muted-foreground" title={r.error}>
              {r.error}
            </span>
          )}
        </span>
      )
    },
  },
  {
    id: "period",
    header: "Period",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="num text-muted-foreground">
        {formatPeriod(row.original.from, row.original.to)} · {row.original.interval}
      </span>
    ),
  },
  {
    accessorKey: "durationMs",
    header: "Duration",
    meta: { align: "right" },
    sortUndefined: "last",
    cell: ({ row }) => (row.original.durationMs != null ? formatDuration(row.original.durationMs / 1000) : <span className="text-muted-foreground">–</span>),
  },
  {
    accessorKey: "submittedAt",
    header: "Submitted",
    meta: { align: "right" },
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDateIST(row.original.submittedAt, "short")}, {formatTimeIST(row.original.submittedAt)}
      </span>
    ),
  },
]

/** The user's latest backtest runs in the shape of lab.backtest_run. Sample rows. */
export function RunsTable({ runs }: { runs: RunRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={runs}
      getRowId={(r) => r.id}
      getRowHref={hrefFor}
      initialSorting={[{ id: "submittedAt", desc: true }]}
      dense
    />
  )
}
