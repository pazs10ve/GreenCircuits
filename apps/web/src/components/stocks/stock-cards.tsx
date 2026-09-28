"use client"

import Link from "next/link"
import type { Route } from "next"
import { useMemo, useState } from "react"
import { hrefOf } from "@greencircuits/market/catalog"
import { formatCrore, formatNumber, formatPrice } from "@greencircuits/market/format"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { Pagination, useRowsPerPage } from "@/components/data/pagination"
import { Sparkline } from "@/components/market/sparkline"
import { WatchButton } from "@/components/market/watch-button"
import { Monogram } from "@/components/parts/monogram"
import { Move } from "@/components/parts/move"
import { RangeMarker } from "@/components/parts/range-marker"

export interface StockCardRow {
  inst: Instrument
  q: Quote | undefined
  spark: number[]
  low52: number
  high52: number
  ltp: number
  mcap: number
  pe: number | null
  pos52: number
}

function StockCard({ r }: { r: StockCardRow }) {
  const href = hrefOf(r.inst) as Route
  return (
    <article className="flex min-w-0 flex-col gap-3.5 rounded-card border border-rule bg-paper p-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Monogram text={r.inst.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <Link href={href} className="block truncate text-[15px] font-semibold decoration-rule-strong underline-offset-4 hover:underline">
            {r.inst.name}
          </Link>
          <span className="block truncate text-xs text-ink-3">
            {r.inst.symbol} · {r.inst.sector}
          </span>
        </div>
        <WatchButton instrumentId={r.inst.id} size="sm" iconOnly />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="figure text-[1.375rem] leading-none">
          <span className="mr-0.5 text-[0.6em] text-ink-3">₹</span>
          {formatPrice(r.ltp, r.inst.tick)}
        </span>
        <Move value={r.q?.changePct} />
      </div>
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <Sparkline data={r.spark} width={260} height={44} area className="h-11 w-full" />
      </Link>
      <RangeMarker
        value={r.pos52}
        left={formatNumber(r.low52, r.low52 >= 1000 ? 0 : 1)}
        caption="52 weeks"
        right={formatNumber(r.high52, r.high52 >= 1000 ? 0 : 1)}
        label={`52-week range ${formatPrice(r.low52, r.inst.tick)} to ${formatPrice(r.high52, r.inst.tick)}`}
      />
      <div className="flex items-center justify-between gap-2 border-t border-rule pt-3 text-xs text-ink-3">
        <span>
          P/E <strong className="num font-semibold text-ink">{r.pe == null ? "–" : `${formatNumber(r.pe, 1)}×`}</strong>
        </span>
        <span className="num">{formatCrore(r.mcap)}</span>
      </div>
    </article>
  )
}

/** The directory as cards, largest companies first, a page at a time. */
export function StockCards({ rows, noun, empty }: { rows: StockCardRow[]; noun: string; empty: React.ReactNode }) {
  const [perPage] = useRowsPerPage()
  // A new filter or page size starts again from the first page: the page belongs to the list it was picked in.
  const list = `${rows.length}:${perPage}`
  const [at, setAt] = useState({ list, page: 0 })
  const page = at.list === list ? at.page : 0
  const sorted = useMemo(() => [...rows].sort((a, b) => b.mcap - a.mcap), [rows])
  const pageCount = Math.max(1, Math.ceil(sorted.length / perPage))
  const shown = sorted.slice(page * perPage, (page + 1) * perPage)
  if (!rows.length) return <p className="rounded-card border border-dashed border-rule-strong py-12 text-center text-sm text-ink-2">{empty}</p>
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {shown.map((r) => (
          <StockCard key={r.inst.id} r={r} />
        ))}
      </div>
      <Pagination
        page={Math.min(page, pageCount - 1)}
        pageCount={pageCount}
        total={sorted.length}
        noun={noun}
        onPage={(p) => {
          setAt({ list, page: p })
          window.scrollTo({ top: 0, behavior: "smooth" })
        }}
      />
    </div>
  )
}
