"use client"

import { useMemo } from "react"
import { getInstrument } from "@greencircuits/market/catalog"
import { formatNumber } from "@greencircuits/market/format"
import { dailyCandles } from "@greencircuits/market/history"
import type { Candle } from "@greencircuits/market/types"
import { Section } from "@/components/editorial/section"
import { Meter } from "@/components/parts/meter"
import { Move } from "@/components/parts/move"
import { RangeMarker } from "@/components/parts/range-marker"
import { Skeleton } from "@/components/ui/skeleton"
import { useDailyBars } from "@/lib/data/client"
import { useQuote } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { goldSilverRatio, inDollarTerms } from "./units"

const GOLD = 300
const SILVER = 301
const USDINR = 400
const SESSIONS = 250

/** A bar's day in IST, so bars from different feeds line up. */
const dayOf = (c: Candle) => Math.floor((c.time + 5.5 * 3600) / 86_400)

/**
 * Gold against silver: how many ounces of silver one of gold buys now,
 * against its range over the year, and gold's year in rupees beside its year
 * in dollars, which is the rupee's part in it.
 */
export function GoldSilver({ className }: { className?: string }) {
  const { mode } = useMarket()
  const gold = useQuote(GOLD)
  const silver = useQuote(SILVER)
  const fx = useQuote(USDINR)
  const goldBars = useDailyBars(GOLD, SESSIONS)
  const silverBars = useDailyBars(SILVER, SESSIONS)
  const fxBars = useDailyBars(USDINR, SESSIONS)

  const year = useMemo(() => {
    const bars = (id: number, live: Candle[] | undefined) => (mode === "live" ? live : dailyCandles(getInstrument(id)!, SESSIONS))
    const [g, s, f] = [bars(GOLD, goldBars.data), bars(SILVER, silverBars.data), bars(USDINR, fxBars.data)]
    if (!g?.length || !s?.length) return null
    const silverOn = new Map(s.map((c) => [dayOf(c), c.close]))
    const ratios = g.flatMap((c) => {
      const sv = silverOn.get(dayOf(c))
      return sv ? [goldSilverRatio(c.close, sv)] : []
    })
    if (ratios.length < 20) return null
    const sorted = [...ratios].sort((a, b) => a - b)
    return { lo: sorted[0]!, hi: sorted.at(-1)!, median: sorted[Math.floor(sorted.length / 2)]!, goldThen: g[0]!.close, fxThen: f?.[0]?.close ?? null }
  }, [mode, goldBars.data, silverBars.data, fxBars.data])

  const now = gold && silver ? goldSilverRatio(gold.ltp, silver.ltp) : null
  if (!year || now == null) {
    return (
      <Section title="Gold to silver" size="rail" className={className}>
        <Skeleton className="h-40" />
      </Section>
    )
  }
  const lo = Math.min(year.lo, now)
  const hi = Math.max(year.hi, now)
  const at = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5)
  const inRupees = (gold!.ltp / year.goldThen - 1) * 100
  const inDollars = year.fxThen && fx ? inDollarTerms(inRupees, year.fxThen, fx.ltp) : null
  const widest = Math.max(Math.abs(inRupees), Math.abs(inDollars ?? 0), 1)
  const rows = [
    { label: "In ₹", value: inRupees, bar: "bg-ink" },
    ...(inDollars != null ? [{ label: "In $", value: inDollars, bar: "bg-ink-3/50" }] : []),
  ]

  return (
    <Section
      title="Gold to silver"
      size="rail"
      className={className}
      description="How many ounces of silver one ounce of gold buys, from the two prices on this page, against its range over the past year. A high number means silver is cheap next to gold. Gold's year in dollars leaves out what the rupee did."
    >
      <div className="flex items-baseline gap-2">
        <span className="figure text-[1.625rem] leading-none">{formatNumber(now, 1)}</span>
        <span className="text-xs text-ink-3">ounces of silver buy one of gold</span>
      </div>
      <RangeMarker
        className="mt-4"
        value={at(now)}
        mark={at(year.median)}
        left={formatNumber(lo, 1)}
        right={formatNumber(hi, 1)}
        caption={`median ${formatNumber(year.median, 1)}`}
        label={`${formatNumber(now, 1)}, against ${formatNumber(lo, 1)} to ${formatNumber(hi, 1)} over the year`}
      />
      <div className="mt-5 border-t border-rule pt-4">
        <h3 className="mb-2.5 text-xs text-ink-3">Gold over a year</h3>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-2.5 text-[13px]">
              <span className="text-ink-2">{r.label}</span>
              <Meter value={Math.abs(r.value) / widest} barClassName={r.bar} />
              <span className="text-right">
                <Move value={r.value} digits={1} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
