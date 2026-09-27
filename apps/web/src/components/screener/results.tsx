"use client"

import Link from "next/link"
import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Columns3, RotateCcw, SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { DataTable } from "@/components/data/data-table"
import { ChangePill, LivePrice } from "@/components/market/price"
import { Panel } from "@/components/shell/page-header"
import { formatCrore, formatNumber, formatPct } from "@greencircuits/market/format"
import { useQuote, useQuoteReader } from "@/lib/stream/hooks"
import { cn } from "@/lib/utils"
import { FIELD_GROUPS, FIELDS, getField, type FieldDef, type LiveRow } from "./fields"
import { PRESETS } from "./presets"
import { stockHref, toLiveRows, useScreener } from "./screener-context"

function formatValue(f: FieldDef, v: number | string | null): string {
  if (v == null) return "–"
  if (typeof v === "string") return v
  switch (f.format) {
    case "crore":
      return formatCrore(v)
    case "pct":
      return `${formatNumber(v, f.decimals)}%`
    case "signedPct":
      return formatPct(v, f.decimals)
    default:
      return formatNumber(v, f.decimals)
  }
}

function LiveChangeCell({ id }: { id: number }) {
  const q = useQuote(id)
  return <ChangePill pct={q?.changePct} />
}

function columnFor(f: FieldDef): ColumnDef<LiveRow> {
  return {
    id: f.name,
    header: f.label,
    accessorFn: (r) => f.get(r) ?? undefined,
    sortUndefined: "last",
    meta: { align: f.type === "number" ? "right" : "left" },
    cell: ({ row }) => {
      const r = row.original
      if (f.name === "price") return <LivePrice id={r.id} className="text-xs" />
      if (f.name === "change_pct") return <LiveChangeCell id={r.id} />
      const v = f.get(r)
      return (
        <span
          className={cn(
            v == null && "text-muted-foreground",
            f.format === "signedPct" && typeof v === "number" && (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted-foreground"),
          )}
        >
          {formatValue(f, v)}
        </span>
      )
    },
  }
}

const NAME_COLUMN: ColumnDef<LiveRow> = {
  id: "name",
  header: "Company",
  accessorFn: (r) => r.symbol,
  meta: { sticky: true, className: "min-w-36 max-w-52" },
  cell: ({ row }) => (
    <span className="block min-w-0">
      <Link href={stockHref(row.original.id)} className="block truncate font-medium hover:text-primary hover:underline">
        {row.original.symbol}
      </Link>
      <span className="block truncate text-[11px] text-muted-foreground">{row.original.name}</span>
    </span>
  ),
}

const COLUMNS = new Map(FIELDS.map((f) => [f.name, columnFor(f)]))

/** The matching stocks, with live price and change, a column picker and sortable headers. */
export function ScreenResults({ className }: { className?: string }) {
  const { rows, applied, columns, toggleColumn, resetColumns, tableKey, run } = useScreener()
  const read = useQuoteReader(2000)
  const ready = read(rows[0]!.id) != null
  const data = useMemo(() => toLiveRows(rows, read).filter(applied.test), [rows, read, applied])
  const tableColumns = useMemo(() => [NAME_COLUMN, ...columns.map((c) => COLUMNS.get(c)!)], [columns])
  const waiting = applied.usesLive && !ready
  const inQuery = new Set(applied.fields.map((f) => f.name))
  const sorting = columns.includes("market_cap") ? [{ id: "market_cap", desc: true }] : []

  return (
    <Panel
      className={className}
      title={
        waiting ? (
          <span className="text-muted-foreground">Waiting for live prices…</span>
        ) : applied.empty ? (
          <span>
            All <span className="num">{rows.length}</span> stocks
          </span>
        ) : (
          <span>
            <span className="num text-primary">{data.length}</span> of <span className="num">{rows.length}</span> stocks match
          </span>
        )
      }
      description={
        applied.empty
          ? "No conditions yet. Write a query or pick a preset."
          : `Filtering on ${applied.fields.map((f) => f.label).join(", ")}${applied.usesLive ? " · updates with the live feed" : ""}`
      }
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 /> Columns <span className="num text-muted-foreground">{columns.length}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="scrollbar-thin w-60 max-h-[min(460px,70vh)]">
            {FIELD_GROUPS.map((group, gi) => (
              <DropdownMenuGroup key={group}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="pb-1 text-[10px] font-medium tracking-wide uppercase">{group}</DropdownMenuLabel>
                {FIELDS.filter((f) => f.group === group).map((f) => (
                  <DropdownMenuCheckboxItem
                    key={f.name}
                    checked={columns.includes(f.name)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggleColumn(f.name)}
                  >
                    <span className="truncate">{f.title}</span>
                    {inQuery.has(f.name) && <span className="ml-auto shrink-0 text-[10px] text-primary">in query</span>}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={resetColumns}>
              <RotateCcw /> Reset to default columns
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {waiting ? (
        <div className="space-y-2 p-4" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <DataTable
          key={tableKey}
          columns={tableColumns}
          data={data}
          getRowId={(r) => String(r.id)}
          getRowHref={(r) => stockHref(r.id)}
          initialSorting={sorting}
          maxHeight="min(70vh, 760px)"
          empty={
            <Empty className="py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No stocks match</EmptyTitle>
                <EmptyDescription>
                  Loosen a condition, or start from a preset such as{" "}
                  <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => run(PRESETS[0]!.query)}>
                    {PRESETS[0]!.name}
                  </button>
                  .
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
      )}
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        Fundamentals are sample data at yesterday&apos;s close; price and change come from the simulated feed. {getField("debt_equity").label} is
        not reported for banks and financials.
      </p>
    </Panel>
  )
}
