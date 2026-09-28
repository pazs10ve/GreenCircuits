"use client"

import { useState } from "react"
import { Search, X } from "lucide-react"
import { ETF_CATEGORIES, ETFS, TRUSTS } from "@greencircuits/market/catalog"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FundStatic } from "./data"
import { ListedTable } from "./listed-table"

const COUNTS = new Map(ETF_CATEGORIES.map((c) => [c, ETFS.filter((e) => e.category === c).length]))

function writeUrl(view: "etfs" | "trusts", category: string, query: string) {
  const params = new URLSearchParams({ view })
  if (view === "etfs" && category !== "all") params.set("holds", category.toLowerCase())
  if (query.trim()) params.set("q", query.trim())
  window.history.replaceState(null, "", `?${params}`)
}

/** ETFs, or REITs and InvITs, with a search and, for ETFs, what they hold. */
export function FundsDirectory({
  view,
  statics,
  initialCategory,
  initialQuery,
}: {
  view: "etfs" | "trusts"
  statics: FundStatic[]
  initialCategory: string
  initialQuery: string
}) {
  const [category, setCategory] = useState(initialCategory)
  const [query, setQuery] = useState(initialQuery)
  const change = (next: { category?: string; query?: string }) => {
    const c = next.category ?? category
    const q = next.query ?? query
    setCategory(c)
    setQuery(q)
    writeUrl(view, c, q)
  }

  return (
    <div className="mt-5 rounded-card border border-rule bg-paper p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
        <InputGroup className="h-9 w-full bg-card sm:w-64">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={query}
            onChange={(e) => change({ query: e.target.value })}
            placeholder={view === "etfs" ? "Fund, symbol or index" : "Trust or symbol"}
            aria-label="Search funds"
            autoComplete="off"
            spellCheck={false}
            className="[&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" onClick={() => change({ query: "" })} aria-label="Clear search">
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        {view === "etfs" && (
          <Select value={category} onValueChange={(v) => change({ category: v })}>
            <SelectTrigger aria-label="Filter by what the ETF holds" className="h-9 w-full bg-card sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="all">Everything</SelectItem>
              {ETF_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c} <span className="num text-ink-3">{COUNTS.get(c)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {view === "etfs" ? (
        <ListedTable kind="etf" funds={ETFS} data={statics} query={query} category={category} onClear={() => change({ query: "", category: "all" })} />
      ) : (
        <ListedTable kind="trust" funds={TRUSTS} data={statics} query={query} category="all" onClear={() => change({ query: "" })} />
      )}
    </div>
  )
}
