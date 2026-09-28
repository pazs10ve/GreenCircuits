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
import { LivePrice } from "@/components/market/price"
import { Monogram } from "@/components/parts/monogram"
import { Move } from "@/components/parts/move"
import { formatCrore, formatNumber, formatPct } from "@greencircuits/market/format"
import { useQuote, useQuoteReader } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { cn } from "@/lib/utils"
import { FIELD_GROUPS, FIELDS, getField, type FieldDef, type LiveRow } from "./fields"
import { PRESETS } from "./presets"
import { ScreenScatter } from "./scatter"
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
  return <Move value={q?.changePct} />
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
      if (f.name === "price") return <LivePrice id={r.id} />
      if (f.name === "change_pct") return <LiveChangeCell id={r.id} />
      const v = f.get(r)
      return (
        <span
          className={cn(
            v == null && "text-ink-3",
            f.format === "signedPct" && typeof v === "number" && (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-ink-2"),
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
  accessorFn: (r) => r.name,
  meta: { sticky: true, className: "min-w-44 max-w-60" },
  cell: ({ row }) => (
    <span className="flex min-w-0 items-center gap-2.5 leading-snug">
      <Monogram text={row.original.symbol} size={28} />
      <span className="min-w-0">
        <Link href={stockHref(row.original.id)} className="block truncate font-semibold text-ink decoration-rule-strong hover:underline hover:underline-offset-4">
          {row.original.name}
        </Link>
        <span className="block truncate text-xs text-ink-3">{row.original.symbol}</span>
      </span>
    </span>
  ),
}

const COLUMNS = new Map(FIELDS.map((f) => [f.name, columnFor(f)]))

/** The matching stocks, with live price and change, a column picker and sortable headers. */
export function ScreenResults({ className }: { className?: string }) {
  const { dataset } = useMarket()
  const { rows, applied, columns, toggleColumn, resetColumns, tableKey, run } = useScreener()
  const read = useQuoteReader(2000)
  const ready = read(rows[0]!.id) != null
  const data = useMemo(() => toLiveRows(rows, read).filter(applied.test), [rows, read, applied])
  const tableColumns = useMemo(() => [NAME_COLUMN, ...columns.map((c) => COLUMNS.get(c)!)], [columns])
  const waiting = applied.usesLive && !ready
  const inQuery = new Set(applied.fields.map((f) => f.name))
  const sorting = columns.includes("market_cap") ? [{ id: "market_cap", desc: true }] : []

  return (
    <section className={cn("rounded-card border border-rule bg-paper p-4 sm:p-5", className)} aria-live="polite">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="font-serif text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">
            {waiting ? (
              <span className="text-ink-3">Waiting for live prices…</span>
            ) : applied.empty ? (
              <>
                All <span className="num">{rows.length}</span> companies
              </>
            ) : (
              <>
                <span className="num">{data.length}</span> of <span className="num">{rows.length}</span> companies match
              </>
            )}
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">
            {applied.empty ? "No conditions yet: write a query, or start from a ready-made screen" : `On ${applied.fields.map((f) => f.label).join(", ")}${applied.usesLive ? ", with live prices" : ""}`}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Columns3 /> Columns <span className="num text-ink-3">{columns.length}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="scrollbar-thin w-60 max-h-[min(460px,70vh)]">
            {FIELD_GROUPS.map((group, gi) => (
              <DropdownMenuGroup key={group}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="pb-1 text-xs font-medium text-ink-3">{group}</DropdownMenuLabel>
                {FIELDS.filter((f) => f.group === group).map((f) => (
                  <DropdownMenuCheckboxItem
                    key={f.name}
                    checked={columns.includes(f.name)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggleColumn(f.name)}
                  >
                    <span className="truncate">{f.title}</span>
                    {inQuery.has(f.name) && <span className="ml-auto shrink-0 text-xs text-accent-ink">in query</span>}
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
      </div>
      {waiting ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <>
          {!applied.empty && data.length > 0 && (
            <div className="mb-5 rounded-panel bg-panel p-3 pt-4">
              <ScreenScatter all={toLiveRows(rows, read)} matches={data} />
            </div>
          )}
          <DataTable
          key={tableKey}
          columns={tableColumns}
          data={data}
          getRowId={(r) => String(r.id)}
          getRowHref={(r) => stockHref(r.id)}
          initialSorting={sorting}
          maxHeight="min(75vh, 820px)"
          noun="companies"
          empty={
            <Empty className="py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>No company matches</EmptyTitle>
                <EmptyDescription>
                  Loosen a condition, or start from a ready-made screen such as{" "}
                  <button type="button" className="link" onClick={() => run(PRESETS[0]!.query)}>
                    {PRESETS[0]!.name}
                  </button>
                  .
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
          />
        </>
      )}
      <p className="mt-3 text-xs text-ink-3">
        {dataset === "real"
          ? "Fundamentals come from company results at the last close; price and change follow the price feed."
          : "Fundamentals are sample data at yesterday’s close; price and change come from the simulated feed."}{" "}
        {getField("debt_equity").label} is not reported for banks and financials.
      </p>
    </section>
  )
}
