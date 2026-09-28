"use client"

import { useMemo } from "react"
import { getInstrument } from "@greencircuits/market/catalog"
import { formatCrore, formatNumber, formatPct, formatPrice } from "@greencircuits/market/format"
import { dailyCandles } from "@greencircuits/market/history"
import { useDailyBars } from "@/lib/data/client"
import { useQuote, useQuoteReader } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { Figure } from "@/components/editorial/figures"
import { RangeMarker } from "@/components/parts/range-marker"
import { ShareBar } from "@/components/parts/share-bar"
import { barsIn, quoteIn, rateOn } from "@/components/charts/in-currency"
import type { ChartCurrency } from "./price-panel"
import { usualDailyMove } from "./year-stats"

/** The figures that don't move with the price, worked out on the server. */
export interface StaticStats {
  mcapCr?: number | null
  pe?: number | null
  pb?: number | null
  divYield?: number | null
  roe?: number | null
  beta?: number | null
  /** For an index: how many of its members the site follows. */
  members?: number
  /** For an index: the members the site follows, to count how many are rising. */
  memberIds?: number[]
  /** Anything else the page knows, after the rest: a commodity's lot. */
  extra?: { label: string; value: string; hint?: string }[]
}

type Tile = { label: string; value: string; hint?: string; tone?: "up" | "down"; visual?: React.ReactNode; wide?: boolean }

/**
 * The numbers a reader checks beside the chart: the day's trading, where the
 * price sits in its year, and, for a company, its size and valuation.
 */
export function KeyStats({ id, stats, currency }: { id: number; stats: StaticStats; currency?: ChartCurrency }) {
  const inst = getInstrument(id)!
  const rupeeQuote = useQuote(id)
  const fxQuote = useQuote(currency?.id ?? id)
  const q = currency ? quoteIn(rupeeQuote, fxQuote, currency.factor) : rupeeQuote
  const { mode } = useMarket()
  // The same year of bars the price chart asks for, so it comes from the same cache.
  const daily = useDailyBars(id, 250)
  const fxDaily = useDailyBars(currency?.id ?? id, 250, currency != null)
  const year = useMemo(() => {
    const rupees = mode === "live" ? daily.data : dailyCandles(inst, 250)
    const fx = !currency ? null : mode === "live" ? fxDaily.data : dailyCandles(getInstrument(currency.id)!, 250)
    // In another currency, each day's bar at that day's rate; nothing until the rates are in.
    const bars = !currency ? rupees : rupees?.length && fx?.length ? barsIn(rupees, rateOn(fx, false), currency.factor) : null
    if (!bars?.length) return null
    const extremes = bars.flatMap((b) => [b.high, b.low])
    return {
      high: Math.max(...extremes, q?.high ?? 0),
      low: Math.min(...extremes, q?.low ?? Infinity),
      first: bars[0]!.close,
      usual: usualDailyMove(bars.map((b) => b.close)),
      full: bars.length >= 240,
    }
  }, [mode, daily.data, fxDaily.data, currency, inst, q?.high, q?.low])
  const read = useQuoteReader(2000)
  const breadth = useMemo(() => {
    if (!stats.memberIds?.length) return null
    let [up, down] = [0, 0]
    for (const id of stats.memberIds) {
      const change = read(id)?.changePct ?? 0
      if (change > 0) up++
      else if (change < 0) down++
    }
    return { up, down, flat: stats.memberIds.length - up - down, total: stats.memberIds.length }
  }, [read, stats.memberIds])
  const price = (v: number | undefined) => (v == null ? "–" : `${currency ? currency.symbol : ""}${formatPrice(v, currency ? 0.01 : inst.tick)}`)
  const where = year && q ? (q.ltp - year.low) / Math.max(1e-9, year.high - year.low) : null
  const today = q && q.high > q.low ? (q.ltp - q.low) / (q.high - q.low) : null
  const busy = q && inst.avgVolume ? q.volume / inst.avgVolume : null
  const fromLow = year && q ? (q.ltp / year.low - 1) * 100 : null

  const tiles: Tile[] = []
  if (breadth) {
    tiles.push({
      label: "Rising today",
      value: `${breadth.up} of ${breadth.total}`,
      hint: `${breadth.down} falling, among the members this site follows`,
      wide: true,
      visual: (
        <ShareBar
          height={6}
          label={`${breadth.up} rising, ${breadth.down} falling`}
          parts={[
            { value: breadth.up, className: "bg-up" },
            { value: breadth.flat, className: "bg-rule-strong" },
            { value: breadth.down, className: "bg-down" },
          ]}
        />
      ),
    })
  }
  // An index, a currency or a commodity has no valuation to show; its year and its usual day say most about it.
  const market = inst.kind === "INDEX" || inst.kind === "CURRENCY" || inst.kind === "COMMODITY"
  if (market && inst.kind !== "COMMODITY" && year?.full && q) {
    const change = (q.ltp / year.first - 1) * 100
    tiles.push({ label: "A year", value: formatPct(change, 1), tone: change > 0 ? "up" : change < 0 ? "down" : undefined, hint: "To the last price" })
  }
  if (market && year?.usual != null) tiles.push({ label: "Usual daily move", value: `${formatNumber(year.usual, 1)}%`, hint: "Over the past year" })
  if (stats.mcapCr != null && stats.mcapCr > 0) tiles.push({ label: "Market value", value: formatCrore(stats.mcapCr) })
  if (stats.pe != null && stats.pe > 0) tiles.push({ label: "P/E", value: `${formatNumber(stats.pe, 1)}×` })
  if (stats.pb != null && stats.pb > 0) tiles.push({ label: "Price to book", value: `${formatNumber(stats.pb, 1)}×` })
  if (stats.divYield != null) tiles.push({ label: "Dividend yield", value: `${formatNumber(stats.divYield, 2)}%` })
  if (stats.roe != null && stats.roe !== 0) tiles.push({ label: "Return on equity", value: `${formatNumber(stats.roe, 1)}%` })
  if (stats.beta != null) tiles.push({ label: "Beta", value: formatNumber(stats.beta, 2), hint: "against the Nifty" })
  if (!breadth && stats.members != null && stats.members > 0) tiles.push({ label: "Members followed", value: String(stats.members) })
  if (busy != null && q && q.volume > 0) tiles.push({ label: "Volume", value: `${formatNumber(busy, 1)}×`, hint: "a usual day" })
  tiles.push(...(stats.extra ?? []))

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2.5 flex items-baseline justify-between gap-3 text-xs text-ink-3">
          <span>Today&apos;s range</span>
          <span>Previous close {price(q?.prevClose)}</span>
        </p>
        <RangeMarker value={today ?? 0.5} left={price(q?.low)} right={price(q?.high)} label={`Today between ${price(q?.low)} and ${price(q?.high)}`} />
      </div>
      <div>
        <p className="mb-2.5 flex items-baseline justify-between gap-3 text-xs text-ink-3">
          <span>52-week range</span>
          {fromLow != null && <span className="font-semibold text-ink">{fromLow < 1 ? "At the low" : `${formatNumber(fromLow, 0)}% above the low`}</span>}
        </p>
        <RangeMarker
          value={where ?? 0.5}
          left={year ? price(year.low) : "–"}
          right={year ? price(year.high) : "–"}
          label={year ? `52-week range ${price(year.low)} to ${price(year.high)}` : undefined}
        />
      </div>
      {tiles.length > 0 && (
        <dl className="grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <Figure key={t.label} variant="panel" size="sm" label={t.label} value={t.value} hint={t.hint} tone={t.tone} visual={t.visual} className={t.wide ? "col-span-2" : undefined} />
          ))}
        </dl>
      )}
    </div>
  )
}
