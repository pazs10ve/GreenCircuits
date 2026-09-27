"use client"

import Link from "next/link"
import { useMemo } from "react"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import { formatINR, formatNumber, formatPct } from "@greencircuits/market/format"
import { useQuoteReader, useSession } from "@/lib/stream/hooks"
import { usePortfolio } from "@/lib/stores/portfolio"
import { cn } from "@/lib/utils"

/** Your holdings today in one figure, one sentence and the few positions that moved them. */
export function PortfolioToday() {
  const holdings = usePortfolio((s) => s.holdings)
  const source = usePortfolio((s) => s.source)
  const read = useQuoteReader(2000)
  const { closed } = useSession()
  const when = closed ?? "today"

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
    const sorted = [...rows].sort((a, b) => b.day - a.day)
    return { rows: sorted, value, day, dayPct, vsNifty: dayPct - nifty, best: sorted[0], worst: sorted.at(-1) }
  }, [holdings, read])

  if (view.rows.length === 0) {
    return (
      <p className="text-ink-2">
        You haven&apos;t added any holdings.{" "}
        <Link href="/portfolio" className="link">
          Import them from your broker
        </Link>{" "}
        to see how they did {when}.
      </p>
    )
  }

  const up = view.day >= 0
  const maxAbs = Math.max(...view.rows.map((r) => Math.abs(r.day)), 1)
  const against = Math.abs(view.vsNifty) < 0.05
    ? "in line with the Nifty 50"
    : `${formatNumber(Math.abs(view.vsNifty), 1)} points ${view.vsNifty > 0 ? "better" : "worse"} than the Nifty 50`
  const lead = `${up ? "Up" : "Down"} ${formatINR(Math.abs(view.day), 0)} ${when}, ${against}.`
  const who = [
    view.best && view.best.day > 0 ? `${view.best.inst.name} added the most (${formatINR(view.best.day, 0)})` : null,
    view.worst && view.worst.day < 0 ? `${view.worst.inst.name} cost you ${formatINR(Math.abs(view.worst.day), 0)}` : null,
  ].filter(Boolean)
  const sentence = who.length ? `${lead} ${who.join("; ")}.` : lead

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
      <div>
        <p className="figure text-[2.5rem] leading-none">{formatINR(view.value, 0)}</p>
        <p className={cn("num mt-2 text-[0.9375rem]", up ? "text-up" : "text-down")}>
          {up ? "+" : "−"}
          {formatINR(Math.abs(view.day), 0)} ({formatPct(view.dayPct)}) {when}
        </p>
        <p className="mt-4 max-w-[30em] text-[0.9375rem] leading-relaxed text-ink-2">{sentence}</p>
        {source === "sample" && (
          <p className="mt-4 text-xs text-ink-3">
            A sample portfolio.{" "}
            <Link href="/portfolio" className="link">
              Import your holdings
            </Link>{" "}
            from a broker CSV; it stays in this browser.
          </p>
        )}
      </div>
      <ul aria-label="Today's change by holding" className="self-start">
        {view.rows.map((r) => (
          <li key={r.inst.id} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_5rem] items-center gap-3 py-1.5 text-sm">
            <Link href={`/stocks/${r.inst.slug}`} className="truncate hover:underline">
              {r.inst.name}
            </Link>
            <span className="relative h-2">
              <span className="absolute inset-y-0 left-1/2 w-px bg-rule" />
              <span
                className={cn("absolute inset-y-0 rounded-sm", r.day >= 0 ? "left-1/2 bg-up/70" : "right-1/2 bg-down/70")}
                style={{ width: `${(Math.abs(r.day) / maxAbs) * 50}%` }}
              />
            </span>
            <span className={cn("num text-right", r.day > 0 ? "text-up" : r.day < 0 ? "text-down" : "text-ink-2")}>
              {r.day >= 0 ? "+" : "−"}
              {formatNumber(Math.abs(r.day), 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
