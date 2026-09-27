"use client"

import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Calculator, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable } from "@/components/data/data-table"
import { Segmented } from "@/components/market/segmented"
import type { BondType } from "@greencircuits/market/reference"
import { formatDateIST, formatNumber } from "@greencircuits/market/format"
import { FREQUENCY_LABEL, type BondRow } from "./bond-math"
import { useBondCalc } from "./calc-store"

const TYPES: BondType[] = ["G-Sec", "SDL", "T-Bill", "SGB", "PSU", "Corporate"]

const RATING_ORDER: Record<string, number> = { SOV: 0, AAA: 1, "AA+": 2, AA: 3 }
const RATINGS = ["SOV", "AAA", "AA+", "AA"]

function yearsLeftLabel(years: number): string {
  return years < 1 ? `${Math.round(years * 365)} days` : `${formatNumber(years, 1)} yrs`
}

const TYPE_NAME: Record<BondType, string> = {
  "G-Sec": "Government",
  SDL: "State",
  "T-Bill": "Treasury bill",
  SGB: "Gold bond",
  PSU: "Public sector",
  Corporate: "Company",
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
          <span className="block leading-snug">
            <span className="block font-medium text-ink">{row.original.name}</span>
            <span className="block font-mono text-xs text-ink-3">{row.original.isin}</span>
          </span>
        ),
      },
      {
        id: "issuer",
        header: "Issuer",
        accessorFn: (b) => b.issuer,
        cell: ({ row }) => <span className="block max-w-56 truncate text-ink-2">{row.original.issuer}</span>,
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (b) => TYPES.indexOf(b.type),
        cell: ({ row }) => <span className="text-ink-2">{TYPE_NAME[row.original.type]}</span>,
      },
      {
        id: "coupon",
        header: "Coupon",
        accessorFn: (b) => b.coupon ?? undefined,
        sortUndefined: "last",
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.coupon == null ? (
            <span className="text-ink-3" title="Issued at a discount and redeemed at face value">
              None
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
          <span className="block leading-snug">
            <span className="block">{formatDateIST(row.original.maturity)}</span>
            <span className="block text-[13px] text-ink-3">{yearsLeftLabel(row.original.yearsLeft)}</span>
          </span>
        ),
      },
      {
        id: "price",
        header: "Price",
        accessorFn: (b) => b.price,
        meta: { align: "right" },
        cell: ({ row }) => `₹${formatNumber(row.original.price, 2)}`,
      },
      {
        id: "ytm",
        header: "Yield",
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
            <span className="text-ink-3">{row.original.rating === "SOV" ? " · sovereign" : ` · ${row.original.agency}`}</span>
          </span>
        ),
      },
      {
        id: "frequency",
        header: "Interest",
        accessorFn: (b) => b.frequency,
        cell: ({ row }) => <span className="text-ink-2">{FREQUENCY_LABEL[row.original.frequency] ?? "–"}</span>,
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
            aria-label={`Price ${row.original.name} in the calculator`}
            title="Price it in the calculator"
            onClick={() => {
              load(row.original)
              const target = document.getElementById("calculator")
              const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
              target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
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
    <div className={className}>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="no-scrollbar -mx-5 overflow-x-auto px-5 xl:mx-0 xl:px-0">
          <Segmented
            value={type}
            onChange={setType}
            aria-label="Kind of bond"
            className="w-max"
            options={(["All", ...TYPES] as const).map((t) => ({
              value: t,
              label: (
                <>
                  {t === "All" ? "All" : TYPE_NAME[t]} <span className="num opacity-60">{counts.get(t) ?? 0}</span>
                </>
              ),
            }))}
          />
        </div>
        <div className="flex gap-2">
          <Select value={rating} onValueChange={setRating}>
            <SelectTrigger className="h-9 w-36 shrink-0 bg-card" aria-label="Rating">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Every rating</SelectItem>
              {RATINGS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r === "SOV" ? "Sovereign" : r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <InputGroup className="h-9 min-w-0 flex-1 bg-card xl:w-60">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, issuer or ISIN" aria-label="Search bonds" />
          </InputGroup>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(b) => b.isin}
        maxHeight="min(75vh, 760px)"
        empty={
          <span className="inline-flex flex-col items-center gap-2">
            No bond matches these filters.
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setType("All")
                setRating("all")
                setSearch("")
              }}
            >
              Clear the filters
            </Button>
          </span>
        }
      />
      <p className="mt-3 text-sm leading-relaxed text-ink-3">
        {filtered ? `${rows.length} of ${bonds.length} bonds. ` : ""}Prices are per ₹100 of face value. Gold bonds are priced in grams of gold on the exchange, so their price
        and yield here are only illustrative. The calculator button prices a bond at any yield.
      </p>
    </div>
  )
}
