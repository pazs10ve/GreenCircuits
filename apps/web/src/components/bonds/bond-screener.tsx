"use client"

import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Calculator, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DataTable } from "@/components/data/data-table"
import { Segmented } from "@/components/market/segmented"
import { Meter } from "@/components/parts/meter"
import { Tag } from "@/components/parts/tag"
import type { BondType } from "@greencircuits/market/reference"
import { formatDateIST, formatNumber } from "@greencircuits/market/format"
import { FREQUENCY_LABEL, type BondRow } from "./bond-math"
import { useBondCalc } from "./calc-store"

const TYPES: BondType[] = ["G-Sec", "SDL", "T-Bill", "SGB", "PSU", "Corporate"]

/** Ratings best first: sovereign, then the agencies' scale. */
const SCALE = ["SOV", "AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B", "C", "D"]
const RATING_ORDER: Record<string, number> = Object.fromEntries(SCALE.map((r, i) => [r, i]))

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

/**
 * Government, state, PSU and company bonds with type, rating and text filters.
 * With real data most bonds don't trade on a given day, so the list starts at
 * those that did.
 */
export function BondScreener({ bonds, real = false, className }: { bonds: BondRow[]; real?: boolean; className?: string }) {
  const [type, setType] = useState<"All" | BondType>("All")
  const [rating, setRating] = useState("all")
  const [search, setSearch] = useState("")
  const [tradedOnly, setTradedOnly] = useState(real)
  const load = useBondCalc((s) => s.load)
  const types = useMemo(() => TYPES.filter((t) => bonds.some((b) => b.type === t)), [bonds])
  const ratings = useMemo(() => [...new Set(bonds.map((b) => b.rating))].sort((a, b) => (RATING_ORDER[a] ?? 99) - (RATING_ORDER[b] ?? 99) || a.localeCompare(b)), [bonds])

  const pool = useMemo(() => (tradedOnly ? bonds.filter((b) => b.fresh) : bonds), [bonds, tradedOnly])
  const counts = useMemo(() => {
    const m = new Map<string, number>([["All", pool.length]])
    for (const b of pool) m.set(b.type, (m.get(b.type) ?? 0) + 1)
    return m
  }, [pool])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return pool.filter(
      (b) =>
        (type === "All" || b.type === type) &&
        (rating === "all" || b.rating === rating) &&
        (!q || [b.name, b.issuer, b.isin, b.agency].some((s) => s.toLowerCase().includes(q))),
    )
  }, [pool, type, rating, search])

  const columns = useMemo<ColumnDef<BondRow>[]>(
    () => [
      {
        id: "name",
        header: "Bond",
        accessorFn: (b) => b.name,
        meta: { sticky: true, className: "min-w-44" },
        cell: ({ row }) => (
          <span className="block leading-snug">
            <span className="block font-semibold text-ink">{row.original.name}</span>
            <span className="block font-mono text-[11px] text-ink-3">{row.original.isin}</span>
          </span>
        ),
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
        header: "Years left",
        accessorFn: (b) => b.maturity.getTime(),
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="flex items-center justify-end gap-2.5" title={formatDateIST(row.original.maturity)}>
            <Meter value={row.original.yearsLeft / 40} height={5} className="w-14" barClassName="bg-ink-3" />
            <span className="w-16 text-right">{yearsLeftLabel(row.original.yearsLeft)}</span>
          </span>
        ),
      },
      {
        id: "price",
        header: "Price",
        accessorFn: (b) => b.price ?? undefined,
        sortUndefined: "last",
        meta: { align: "right" },
        cell: ({ row }) => {
          const { price, fresh } = row.original
          if (price == null) return <span className="text-ink-3">–</span>
          return (
            <span className={fresh ? undefined : "text-ink-3"} title={fresh ? undefined : "Last traded before today"}>
              ₹{formatNumber(price, 2)}
            </span>
          )
        },
      },
      {
        id: "ytm",
        header: "Yield",
        accessorFn: (b) => b.ytm ?? undefined,
        sortUndefined: "last",
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.ytm == null ? <span className="text-ink-3">–</span> : <span className="font-semibold">{formatNumber(row.original.ytm, 2)}%</span>,
      },
      {
        id: "rating",
        header: "Rating",
        accessorFn: (b) => RATING_ORDER[b.rating] ?? 9,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Tag>{row.original.rating === "SOV" ? "Sovereign" : row.original.rating}</Tag>
            {row.original.rating !== "SOV" && <span className="text-xs text-ink-3">{row.original.agency}</span>}
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
        <div className="no-scrollbar -mx-(--gutter) overflow-x-auto px-(--gutter) xl:mx-0 xl:px-0">
          <Segmented
            value={type}
            onChange={setType}
            aria-label="Kind of bond"
            className="w-max"
            options={(["All", ...types] as const).map((t) => ({
              value: t,
              label: (
                <>
                  {t === "All" ? "All" : TYPE_NAME[t]} <span className="num opacity-60">{counts.get(t) ?? 0}</span>
                </>
              ),
            }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {real && (
            <div className="mr-2 flex items-center gap-2">
              <Switch id="bonds-traded" checked={tradedOnly} onCheckedChange={setTradedOnly} />
              <Label htmlFor="bonds-traded" className="text-[13px] font-normal text-ink-2">
                Traded today
              </Label>
            </div>
          )}
          <Select value={rating} onValueChange={setRating}>
            <SelectTrigger className="h-9 w-36 shrink-0 bg-card" aria-label="Rating">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Every rating</SelectItem>
              {ratings.map((r) => (
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
        getRowId={(b) => b.id}
        noun="bonds"
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
                setTradedOnly(false)
              }}
            >
              Clear the filters
            </Button>
          </span>
        }
      />
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        {filtered || tradedOnly ? `${rows.length} of ${bonds.length} bonds. ` : ""}Prices are per ₹100 of face value.{" "}
        {real
          ? "The government's bonds are taken to mature in the middle of their year, as the NSE's list gives only the year, and yields are worked out from the last price without accrued interest."
          : "Each is priced off a model yield curve, at a spread for its rating."}{" "}
        The calculator button prices a bond at any yield.
      </p>
    </div>
  )
}
