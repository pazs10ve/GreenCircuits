"use client"

import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Calculator, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable } from "@/components/data/data-table"
import { Segmented } from "@/components/market/segmented"
import { SampleBadge } from "@/components/market/source-badge"
import { Panel } from "@/components/shell/page-header"
import type { BondType } from "@greencircuits/market/reference"
import { formatDateIST, formatNumber } from "@greencircuits/market/format"
import { cn } from "@/lib/utils"
import { FREQUENCY_LABEL, type BondRow } from "./bond-math"
import { useBondCalc } from "./calc-store"

const TYPES: BondType[] = ["G-Sec", "SDL", "T-Bill", "SGB", "PSU", "Corporate"]

const TYPE_TONE: Record<BondType, string> = {
  "G-Sec": "text-brand border-brand/40",
  SDL: "text-chart-2 border-chart-2/40",
  "T-Bill": "text-chart-5 border-chart-5/40",
  SGB: "text-chart-4 border-chart-4/40",
  PSU: "text-chart-1 border-chart-1/40",
  Corporate: "text-chart-3 border-chart-3/40",
}

const RATING_ORDER: Record<string, number> = { SOV: 0, AAA: 1, "AA+": 2, AA: 3 }
const RATINGS = ["SOV", "AAA", "AA+", "AA"]

function yearsLeftLabel(years: number): string {
  return years < 1 ? `${Math.round(years * 365)} days` : `${formatNumber(years, 1)} yrs`
}

export function TypeChip({ type }: { type: BondType }) {
  return (
    <span className={cn("inline-flex rounded-sm border px-1.5 py-px font-mono text-[9px] font-medium tracking-wide uppercase", TYPE_TONE[type])}>
      {type}
    </span>
  )
}

/** Government, state, PSU and corporate bonds with type, rating and text filters. */
export function BondScreener({ bonds, className }: { bonds: BondRow[]; className?: string }) {
  const [type, setType] = useState<"All" | BondType>("All")
  const [rating, setRating] = useState("all")
  const [search, setSearch] = useState("")
  const load = useBondCalc((s) => s.load)

  const counts = useMemo(() => {
    const m = new Map<string, number>([["All", bonds.length]])
    for (const b of bonds) m.set(b.type, (m.get(b.type) ?? 0) + 1)
    return m
  }, [bonds])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return bonds.filter(
      (b) =>
        (type === "All" || b.type === type) &&
        (rating === "all" || b.rating === rating) &&
        (!q || [b.name, b.issuer, b.isin, b.agency].some((s) => s.toLowerCase().includes(q))),
    )
  }, [bonds, type, rating, search])

  const columns = useMemo<ColumnDef<BondRow>[]>(
    () => [
      {
        id: "name",
        header: "Bond",
        accessorFn: (b) => b.name,
        meta: { sticky: true, className: "min-w-44" },
        cell: ({ row }) => (
          <span className="block">
            <span className="block font-medium">{row.original.name}</span>
            <span className="block font-mono text-[10px] text-muted-foreground">{row.original.isin}</span>
          </span>
        ),
      },
      {
        id: "issuer",
        header: "Issuer",
        accessorFn: (b) => b.issuer,
        cell: ({ row }) => <span className="block max-w-52 truncate">{row.original.issuer}</span>,
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (b) => TYPES.indexOf(b.type),
        cell: ({ row }) => <TypeChip type={row.original.type} />,
      },
      {
        id: "coupon",
        header: "Coupon",
        accessorFn: (b) => b.coupon ?? undefined,
        sortUndefined: "last",
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.coupon == null ? (
            <span className="text-muted-foreground" title="Issued at a discount and redeemed at face value">
              Zero
            </span>
          ) : (
            `${formatNumber(row.original.coupon, 2)}%`
          ),
      },
      {
        id: "maturity",
        header: "Maturity",
        accessorFn: (b) => b.maturity.getTime(),
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="block leading-tight">
            <span className="block">{formatDateIST(row.original.maturity)}</span>
            <span className="block text-[11px] text-muted-foreground">{yearsLeftLabel(row.original.yearsLeft)}</span>
          </span>
        ),
      },
      {
        id: "price",
        header: "Price ₹",
        accessorFn: (b) => b.price,
        meta: { align: "right" },
        cell: ({ row }) => formatNumber(row.original.price, 2),
      },
      {
        id: "ytm",
        header: "YTM",
        accessorFn: (b) => b.ytm,
        meta: { align: "right" },
        cell: ({ row }) => <span className="font-medium">{formatNumber(row.original.ytm, 2)}%</span>,
      },
      {
        id: "rating",
        header: "Rating",
        accessorFn: (b) => RATING_ORDER[b.rating] ?? 9,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            <span className="font-medium">{row.original.rating}</span>
            <span className="text-muted-foreground">{row.original.rating === "SOV" ? " · Sovereign" : ` · ${row.original.agency}`}</span>
          </span>
        ),
      },
      {
        id: "frequency",
        header: "Interest",
        accessorFn: (b) => b.frequency,
        cell: ({ row }) => <span className="text-muted-foreground">{FREQUENCY_LABEL[row.original.frequency] ?? "–"}</span>,
      },
      {
        id: "calc",
        header: () => <span className="sr-only">Calculator</span>,
        enableSorting: false,
        meta: { align: "right", className: "w-10 px-2" },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Open ${row.original.name} in the bond calculator`}
            title="Open in the calculator"
            onClick={() => {
              load(row.original)
              const target = document.getElementById("calculator")
              const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
              target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" })
            }}
          >
            <Calculator />
          </Button>
        ),
      },
    ],
    [load],
  )

  const filtered = type !== "All" || rating !== "all" || search.trim() !== ""

  return (
    <Panel
      className={className}
      title="Bond screener"
      description={`${filtered ? `${rows.length} of ${bonds.length}` : bonds.length} bonds · prices per ₹100 face value`}
      actions={<SampleBadge />}
    >
      <div className="flex flex-col gap-2 border-b px-3 py-2.5 xl:flex-row xl:items-center xl:justify-between">
        <div className="no-scrollbar -mx-3 overflow-x-auto px-3 xl:mx-0 xl:px-0">
          <Segmented
            value={type}
            onChange={setType}
            aria-label="Bond type"
            options={(["All", ...TYPES] as const).map((t) => ({
              value: t,
              label: (
                <>
                  {t} <span className="num text-muted-foreground">{counts.get(t) ?? 0}</span>
                </>
              ),
            }))}
          />
        </div>
        <div className="flex gap-2">
          <Select value={rating} onValueChange={setRating}>
            <SelectTrigger size="sm" className="w-32 shrink-0" aria-label="Rating">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ratings</SelectItem>
              {RATINGS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r === "SOV" ? "Sovereign" : r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <InputGroup className="h-6 min-w-0 flex-1 xl:w-60">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              className="h-6"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, issuer or ISIN"
              aria-label="Search bonds"
            />
          </InputGroup>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(b) => b.isin}
        maxHeight="min(70vh, 720px)"
        empty={
          <span className="inline-flex flex-col items-center gap-2">
            No bonds match these filters.
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setType("All")
                setRating("all")
                setSearch("")
              }}
            >
              Clear filters
            </Button>
          </span>
        }
      />
      <p className="border-t px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Sample terms on real issuer names; ISINs are placeholders. SGBs are denominated in grams of gold and trade on the exchange per
        gram, so their price and yield here are only illustrative. Use the calculator button to price any bond at a different yield.
      </p>
    </Panel>
  )
}
