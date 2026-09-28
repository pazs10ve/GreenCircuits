"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatNumber } from "@greencircuits/market/format"
import { ROWS_PER_PAGE, usePreferences } from "@/lib/stores/preferences"
import { cn } from "@/lib/utils"
import { pageNumbers } from "./pages"

/** The reader's rows per page, which every long table shares. */
export function useRowsPerPage(): [number, (n: number) => void] {
  const rows = usePreferences((s) => s.rowsPerPage)
  const set = usePreferences((s) => s.set)
  return [rows, (rowsPerPage) => set({ rowsPerPage })]
}

/**
 * Under a long list: which rows are showing, the pages either side, and how
 * many rows a page holds. The page size is the reader's choice for every table.
 */
export function Pagination({
  page,
  pageCount,
  total,
  noun = "rows",
  onPage,
  className,
}: {
  page: number
  pageCount: number
  total: number
  /** What the rows are, for the count: "companies", "funds". */
  noun?: string
  onPage: (page: number) => void
  className?: string
}) {
  const [size, setSize] = useRowsPerPage()
  const from = total === 0 ? 0 : page * size + 1
  const to = Math.min(total, (page + 1) * size)
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 text-sm", className)}>
      <p className="num text-ink-2" aria-live="polite">
        {formatNumber(from, 0)}–{formatNumber(to, 0)} <span className="text-ink-3">of</span> {formatNumber(total, 0)} {noun}
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-ink-3">
          Rows per page
          <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
            <SelectTrigger size="default" className="num w-[4.25rem] text-sm text-ink" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROWS_PER_PAGE.map((n) => (
                <SelectItem key={n} value={String(n)} className="num">
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {pageCount > 1 && (
          <nav aria-label="Pages" className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            {pageNumbers(page, pageCount).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="w-6 text-center text-ink-3" aria-hidden="true">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label={`Page ${p + 1}`}
                  aria-current={p === page ? "page" : undefined}
                  onClick={() => onPage(p)}
                  className={cn("num w-auto min-w-8 px-1.5", p === page && "font-semibold text-ink")}
                >
                  {p + 1}
                </Button>
              ),
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => onPage(page + 1)} disabled={page >= pageCount - 1} aria-label="Next page">
              <ChevronRight />
            </Button>
          </nav>
        )}
      </div>
    </div>
  )
}
