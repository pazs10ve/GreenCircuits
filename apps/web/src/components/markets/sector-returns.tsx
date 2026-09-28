"use client"

import Link from "next/link"
import { useMemo } from "react"
import { formatPct } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { heat } from "@/components/parts/heat"
import type { MarketRow } from "./market-rows"

/** How big a move over each period gets the full colour: a year moves more than a day. */
const PERIODS = [
  { key: "today", label: "Today", full: 3 },
  { key: "week", label: "Week", full: 6 },
  { key: "month", label: "Month", full: 10 },
  { key: "year", label: "Year", full: 30 },
] as const

type Period = (typeof PERIODS)[number]["key"]

/**
 * Each sector's move today, this week, this month and this year, weighted by
 * company size, as a grid coloured by how far each is from zero, so the
 * sectors leading and lagging stand out over any period.
 */
export function SectorReturns({ rows }: { rows: MarketRow[] }) {
  const read = useQuoteReader(3000)
  const sectors = useMemo(() => {
    const acc = new Map<string, Record<Period, { weight: number; sum: number }>>()
    for (const r of rows) {
      const q = read(r.id)
      const e = acc.get(r.sector) ?? { today: { weight: 0, sum: 0 }, week: { weight: 0, sum: 0 }, month: { weight: 0, sum: 0 }, year: { weight: 0, sum: 0 } }
      const add = (p: Period, v: number | null | undefined) => {
        if (v == null || !Number.isFinite(v)) return
        e[p].weight += r.mcapCr
        e[p].sum += r.mcapCr * v
      }
      add("today", q?.changePct)
      add("week", r.week)
      add("month", r.month)
      add("year", r.year)
      acc.set(r.sector, e)
    }
    return [...acc]
      .map(([sector, e]) => ({ sector, ...(Object.fromEntries(PERIODS.map((p) => [p.key, e[p.key].weight > 0 ? e[p.key].sum / e[p.key].weight : null])) as Record<Period, number | null>) }))
      .sort((a, b) => (b.today ?? 0) - (a.today ?? 0))
  }, [rows, read])

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr className="text-xs text-ink-3">
            <th scope="col" className="pb-1 text-left font-medium">
              <span className="sr-only">Sector</span>
            </th>
            {PERIODS.map((p) => (
              <th key={p.key} scope="col" className="px-0.5 pb-1 text-center font-medium">
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sectors.map((s) => (
            <tr key={s.sector}>
              <th scope="row" className="pr-3 text-left font-medium whitespace-nowrap">
                <Link href={`/stocks?sector=${s.sector.toLowerCase()}`} className="decoration-rule-strong underline-offset-4 hover:underline">
                  {s.sector}
                </Link>
              </th>
              {PERIODS.map((p) => {
                const v = s[p.key]
                const { bg, fg } = heat(v, p.full)
                return (
                  <td key={p.key} className="px-0.5">
                    <span className="num flex h-8 min-w-13 items-center justify-center rounded-md px-1.5 text-[13px] font-semibold sm:min-w-16" style={{ background: bg, color: fg }}>
                      {v == null ? "–" : formatPct(v, 1)}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
