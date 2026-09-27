"use client"

import { useCallback, useState } from "react"
import { Search, X } from "lucide-react"
import { EQUITIES, INDICES, SECTORS } from "@greencircuits/market/catalog"
import type { Sector } from "@greencircuits/market/types"
import { Segmented } from "@/components/market/segmented"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { IndexStatic, StockStatic } from "./derive"
import { IndicesTable } from "./indices-table"
import { SectorsTable } from "./sectors-table"
import { StocksTable } from "./stocks-table"

export type DirectoryView = "stocks" | "indices" | "sectors"

const VIEWS = [
  { value: "stocks", label: `Stocks ${EQUITIES.length}` },
  { value: "indices", label: `Indices ${INDICES.length}` },
  { value: "sectors", label: `Sectors ${SECTORS.length}` },
] as const

const SECTOR_COUNTS = new Map(SECTORS.map((s) => [s, EQUITIES.filter((e) => e.sector === s).length]))

/** Keep the view and filters in the address bar so a filtered list can be shared. */
function writeUrl(view: DirectoryView, sector: Sector | "all", query: string) {
  const params = new URLSearchParams()
  if (view !== "stocks") params.set("view", view)
  if (view === "stocks" && sector !== "all") params.set("sector", sector)
  if (view === "stocks" && query.trim()) params.set("q", query.trim())
  const search = params.toString()
  window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname)
}

/** Every stock, index and sector, one table at a time, with a search and a sector filter for stocks. */
export function StocksDirectory({
  stocks,
  indices,
  initialView,
  initialSector,
  initialQuery,
}: {
  stocks: StockStatic[]
  indices: IndexStatic[]
  initialView: DirectoryView
  initialSector: Sector | "all"
  initialQuery: string
}) {
  const [view, setView] = useState<DirectoryView>(initialView)
  const [sector, setSector] = useState<Sector | "all">(initialSector)
  const [query, setQuery] = useState(initialQuery)

  const changeView = (next: DirectoryView) => {
    setView(next)
    writeUrl(next, sector, query)
  }
  const changeSector = (next: Sector | "all") => {
    setSector(next)
    writeUrl(view, next, query)
  }
  const changeQuery = (next: string) => {
    setQuery(next)
    writeUrl(view, sector, next)
  }
  const clearFilters = () => {
    setQuery("")
    setSector("all")
    writeUrl(view, "all", "")
  }
  const pickSector = useCallback((next: Sector) => {
    setView("stocks")
    setSector(next)
    setQuery("")
    writeUrl("stocks", next, "")
  }, [])

  return (
    <div className="mt-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Segmented value={view} onChange={changeView} options={VIEWS} aria-label="Show" />
        {view === "stocks" && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <InputGroup className="h-9 w-full bg-card sm:w-64">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={query}
                onChange={(e) => changeQuery(e.target.value)}
                placeholder="Company or symbol"
                aria-label="Search stocks by company or symbol"
                autoComplete="off"
                spellCheck={false}
                className="[&::-webkit-search-cancel-button]:appearance-none"
              />
              {query && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-xs" onClick={() => changeQuery("")} aria-label="Clear search">
                    <X />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
            <Select value={sector} onValueChange={(v) => changeSector(v as Sector | "all")}>
              <SelectTrigger aria-label="Filter by sector" className="h-9 w-full bg-card sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectItem value="all">Every sector</SelectItem>
                {SECTORS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s} <span className="num text-ink-3">{SECTOR_COUNTS.get(s)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {view === "stocks" && <StocksTable data={stocks} query={query} sector={sector} onClear={clearFilters} />}
      {view === "indices" && <IndicesTable data={indices} />}
      {view === "sectors" && <SectorsTable onPick={pickSector} />}
    </div>
  )
}
