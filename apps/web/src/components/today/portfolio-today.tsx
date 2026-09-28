"use client"

import Link from "next/link"
import { useMemo } from "react"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import { formatINR, formatNumber } from "@greencircuits/market/format"
import { Monogram } from "@/components/parts/monogram"
import { Move } from "@/components/parts/move"
import { useQuoteReader, useSession } from "@/lib/stream/hooks"
import { usePortfolio } from "@/lib/stores/portfolio"
import { cn } from "@/lib/utils"

/** How many holdings to list: the ones that moved the total most. */
const SHOWN = 4

/** Your holdings today: the value and its move, against the Nifty 50, and the positions that moved it most. */
export function PortfolioToday() {
  const holdings = usePortfolio((s) => s.holdings)
  const source = usePortfolio((s) => s.source)
  const read = useQuoteReader(2000)
  const { closed } = useSession()
  const when = closed ? "at the close" : "today"

  const view = useMemo(() => {
    const rows = holdings
      .map((h) => {
        const inst = getInstrument(h.instrumentId)
        const q = read(h.instrumentId)
        if (!inst || !q) return null
        return { inst, value: h.qty * q.ltp, day: h.qty * q.change, pct: q.changePct }
      })
      .filter((r) => r != null)
    const value = rows.reduce((s, r) => s + r.value, 0)
    const day = rows.reduce((s, r) => s + r.day, 0)
    const dayPct = value - day > 0 ? (day / (value - day)) * 100 : 0
    const nifty = read(INDEX.NIFTY)?.changePct ?? 0
    const movers = [...rows].sort((a, b) => Math.abs(b.day) - Math.abs(a.day)).slice(0, SHOWN)
    return { movers, count: rows.length, value, day, dayPct, vsNifty: dayPct - nifty }
  }, [holdings, read])

  if (view.count === 0) {
    return (
      <p className="text-sm text-ink-2">
        No holdings yet.{" "}
        <Link href="/portfolio" className="link">
          Add yours
        </Link>{" "}
        to see how they did {when}.
      </p>
    )
  }

  const up = view.day >= 0
  const against =
    Math.abs(view.vsNifty) < 0.05 ? "in line with the Nifty 50" : `${formatNumber(Math.abs(view.vsNifty), 1)} points ${view.vsNifty > 0 ? "ahead of" : "behind"} the Nifty 50`
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="figure text-[2rem] leading-none">{formatINR(view.value, 0)}</span>
        <Move value={view.dayPct} size="md" />
      </div>
      <p className="mt-2 text-[13px] text-ink-3">
        <span className={cn("num font-semibold", up ? "text-up" : "text-down")}>
          {up ? "+" : "−"}
          {formatINR(Math.abs(view.day), 0)}
        </span>{" "}
        {when}, {against}
      </p>
      {source === "sample" && (
        <p className="mt-1 text-xs text-ink-3">
          A sample portfolio.{" "}
          <Link href="/portfolio" className="link">
            Add your own
          </Link>
        </p>
      )}
      <ul aria-label={`The holdings that moved it most ${when}`} className="mt-3 divide-y divide-rule border-t border-rule">
        {view.movers.map((r) => (
          <li key={r.inst.id}>
            <Link href={`/stocks/${r.inst.slug}`} className="group grid grid-cols-[30px_minmax(0,1fr)_auto_4rem] items-center gap-3 py-2">
              <Monogram text={r.inst.symbol} />
              <span className="truncate text-sm font-semibold group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4">{r.inst.name}</span>
              <span className={cn("num text-[13px]", r.day >= 0 ? "text-up" : "text-down")}>
                {r.day >= 0 ? "+" : "−"}
                {formatINR(Math.abs(r.day), 0)}
              </span>
              <span className="flex justify-end">
                <Move value={r.pct} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
