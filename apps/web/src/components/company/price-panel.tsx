"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { CandlestickChart, ChevronDown, GitCompareArrows, LineChart as LineIcon } from "lucide-react"
import { CandleChart } from "@/components/charts/candle-chart"
import { INDICATORS, WARMUP, weekly, type Indicator } from "@/components/charts/indicators"
import { Segmented } from "@/components/market/segmented"
import { Move } from "@/components/parts/move"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LineChart, type ChartAnnotation, type ScrubPoint } from "@/components/viz/line-chart"
import { useNow } from "@/hooks/use-now"
import { getInstrument } from "@greencircuits/market/catalog"
import { dailyCandles, intradayCandles } from "@greencircuits/market/history"
import { formatDateIST, formatPrice, formatSigned, formatTimeIST } from "@greencircuits/market/format"
import type { Candle, Quote } from "@greencircuits/market/types"
import { useQuote, useSession } from "@/lib/stream/hooks"
import { useDailyBars, useIntradayBars } from "@/lib/data/client"
import { useMarket } from "@/lib/stream/market-context"
import { quoteStore } from "@/lib/stream/store"
import { usePreferences } from "@/lib/stores/preferences"
import { cn } from "@/lib/utils"

type Range = "1D" | "1M" | "6M" | "1Y" | "5Y"

const RANGES: { id: Range; label: string; sessions: number; phrase: string }[] = [
  { id: "1D", label: "1D", sessions: 0, phrase: "today" },
  { id: "1M", label: "1M", sessions: 22, phrase: "past month" },
  { id: "6M", label: "6M", sessions: 126, phrase: "past six months" },
  { id: "1Y", label: "1Y", sessions: 250, phrase: "past year" },
  { id: "5Y", label: "5Y", sessions: 1250, phrase: "past five years" },
]

/** Five years of candles are weekly, from ten years of days, so a 200-week average has history behind it too. */
const WEEKLY_SESSIONS = 2500

const istDay = (ms: number) => new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

/** The latest price as the last candle: it updates the bar for its session, or opens the next one. */
function withQuote(bars: Candle[], q: Quote | undefined, weeklyBars: boolean): Candle[] {
  const last = bars.at(-1)
  if (!q || !last) return bars
  const sameBar = weeklyBars ? q.ts / 1000 - last.time < 7 * 86_400 : istDay(last.time * 1000) === istDay(q.ts)
  if (sameBar) return [...bars.slice(0, -1), { ...last, high: Math.max(last.high, q.ltp), low: Math.min(last.low, q.ltp), close: q.ltp }]
  if (q.ts / 1000 < last.time) return bars
  return [...bars, { time: Math.floor(Date.parse(`${istDay(q.ts)}T00:00:00Z`) / 1000), open: q.open, high: q.high, low: q.low, close: q.ltp, volume: q.volume }]
}

/**
 * The headline price and its chart: a line of closes, or candles with the
 * studies a reader picks. Scrubbing either replaces the big figure with the
 * price at that moment and the change since the range began.
 */
export function PricePanel({ id, defaultRange = "1Y" }: { id: number; defaultRange?: Range }) {
  const inst = getInstrument(id)!
  const q = useQuote(id)
  const { mode, initial } = useMarket()
  const now = useNow(60_000)
  const [range, setRange] = useState<Range>(defaultRange)
  const [scrub, setScrub] = useState<ScrubPoint | null>(null)
  const chartType = usePreferences((s) => s.chartType)
  const indicators = usePreferences((s) => s.indicators)
  const setPreferences = usePreferences((s) => s.set)
  const { closed } = useSession()
  const minute = now?.getTime() ?? null
  const spec = RANGES.find((r) => r.id === range)!
  const candles = chartType === "candles"
  const weeklyBars = candles && range === "5Y"
  // Candles fetch history before the first bar shown, so the averages are there from the start.
  const sessions = !candles ? spec.sessions : weeklyBars ? WEEKLY_SESSIONS : spec.sessions + WARMUP
  // Index levels are points, not rupees.
  const currency = inst.kind === "INDEX" ? "" : "₹"
  const intraday = useIntradayBars(id, 5)
  const daily = useDailyBars(id, sessions, range !== "1D")

  // Bars for the range: live from the database, or generated in the demo to meet the current price.
  const bars = useMemo<Candle[] | null>(() => {
    if (minute == null) return null
    if (range === "1D") {
      if (mode === "live") return intraday.data?.length ? intraday.data : null
      const live = quoteStore.get(id) ?? initial.get(id)
      return live ? intradayCandles(inst, live.open, live.ltp, 5, new Date(minute)) : null
    }
    if (mode === "live") return daily.data?.length ? daily.data : null
    return dailyCandles(inst, sessions)
  }, [minute, range, id, inst, initial, mode, sessions, intraday.data, daily.data])

  const points = useMemo(() => {
    if (candles || !bars || !q || minute == null) return null
    const base = bars.map((c) => ({ t: c.time, v: c.close }))
    if (range === "1D") return [...base.slice(0, -1), { t: base.at(-1)!.t, v: q.ltp }]
    // The latest price is its session's close: it replaces a stored bar for that day rather than adding a day.
    const last = base.at(-1)!
    if (mode === "live" && istDay(last.t * 1000) === istDay(q.ts)) return [...base.slice(0, -1), { t: last.t, v: q.ltp }]
    return [...base, { t: Math.floor((mode === "live" ? q.ts : minute) / 1000), v: q.ltp }]
  }, [candles, bars, q, range, minute, mode])

  const candleBars = useMemo(() => {
    if (!candles || !bars) return null
    const series = weeklyBars ? weekly(bars) : bars
    return range === "1D" && q ? withQuote(series, q, false) : withQuote(series, q, weeklyBars)
  }, [candles, bars, weeklyBars, range, q])
  const visibleBars = range === "1D" ? undefined : weeklyBars ? 262 : spec.sessions

  const annotations = useMemo<ChartAnnotation[]>(() => {
    if (!points || range === "1D") return []
    let hi = points[0]!
    let lo = points[0]!
    for (const p of points) {
      if (p.v > hi.v) hi = p
      if (p.v < lo.v) lo = p
    }
    return [
      { t: hi.t, label: `High ${currency}${formatPrice(hi.v, inst.tick)}`, side: "above" },
      { t: lo.t, label: `Low ${currency}${formatPrice(lo.v, inst.tick)}`, side: "below" },
    ]
  }, [points, range, inst.tick, currency])

  // The change is over what's on screen: from the first visible candle, or the first point of the line.
  const firstShown = candleBars ? candleBars[Math.max(0, candleBars.length - (visibleBars ?? candleBars.length))]?.open : points?.[0]?.v
  const start = range === "1D" ? q?.prevClose : firstShown
  const shown = scrub?.values[0] ?? q?.ltp
  const change = shown != null && start != null ? shown - start : undefined
  const pct = change != null && start ? (change / start) * 100 : undefined
  const up = (range === "1D" ? q?.changePct : pct) ?? 0
  const when = scrub
    ? range === "1D"
      ? `at ${formatTimeIST(scrub.t * 1000)}`
      : `on ${formatDateIST(scrub.t * 1000, "medium")}`
    : range === "1D" && closed
      ? `at the close ${closed}`
      : spec.phrase

  const toggle = (study: Indicator, on: boolean) => setPreferences({ indicators: on ? [...indicators, study] : indicators.filter((i) => i !== study) })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            aria-label="Chart type"
            value={chartType}
            onChange={(t) => {
              setPreferences({ chartType: t })
              setScrub(null)
            }}
            options={[
              {
                value: "line",
                label: (
                  <>
                    <LineIcon className="size-3.5" aria-hidden="true" /> Line
                  </>
                ),
              },
              {
                value: "candles",
                label: (
                  <>
                    <CandlestickChart className="size-3.5" aria-hidden="true" /> Candles
                  </>
                ),
              },
            ]}
          />
          {candles && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Studies{indicators.length > 0 && <span className="num text-ink-3">{indicators.length}</span>}
                  <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel className="text-xs font-normal text-ink-3">On the chart</DropdownMenuLabel>
                {INDICATORS.filter((i) => i.pane === "price").map((i) => (
                  <DropdownMenuCheckboxItem key={i.id} checked={indicators.includes(i.id)} onCheckedChange={(on) => toggle(i.id, on)} onSelect={(e) => e.preventDefault()}>
                    <span className="flex flex-col">
                      <span>{i.label}</span>
                      <span className="text-xs text-ink-3">{i.detail}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-ink-3">Below it</DropdownMenuLabel>
                {INDICATORS.filter((i) => i.pane === "own").map((i) => (
                  <DropdownMenuCheckboxItem key={i.id} checked={indicators.includes(i.id)} onCheckedChange={(on) => toggle(i.id, on)} onSelect={(e) => e.preventDefault()}>
                    <span className="flex flex-col">
                      <span>{i.label}</span>
                      <span className="text-xs text-ink-3">{i.detail}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            aria-label="Chart range"
            value={range}
            onChange={(r) => {
              setRange(r)
              setScrub(null)
            }}
            options={RANGES.map((r) => ({ value: r.id, label: r.label }))}
          />
          <Button asChild variant="ghost" size="sm">
            <Link href={`/compare?s=${encodeURIComponent(inst.symbol)}`}>
              <GitCompareArrows /> Compare
            </Link>
          </Button>
        </div>
      </div>
      {/* What the chart shows, in a line: the change over the range, or the price where the pointer is. */}
      <p className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
        {scrub && shown != null && (
          <span className="num font-semibold text-ink">
            {currency}
            {formatPrice(shown, inst.tick)}
          </span>
        )}
        {change != null && pct != null && <Move value={pct} />}
        {change != null && <span className={cn("num", change >= 0 ? "text-up" : "text-down")}>{formatSigned(change, 2)}</span>}
        <span>{when}</span>
      </p>
      <div className="mt-3">
        {candles ? (
          candleBars ? (
            <>
              <CandleChart
                key={`${range}-${weeklyBars}`}
                candles={candleBars}
                visible={visibleBars}
                indicators={indicators}
                intraday={range === "1D"}
                tick={inst.tick}
                height={360}
                onHover={(bar) => setScrub(bar ? { t: bar.time, values: [bar.close] } : null)}
                ariaLabel={`${inst.name} ${weeklyBars ? "weekly" : range === "1D" ? "five-minute" : "daily"} candles, ${spec.phrase}.`}
              />
              {weeklyBars && <p className="mt-2 text-xs text-ink-3">Weekly candles; the averages count weeks.</p>}
            </>
          ) : (
            <div style={{ height: 360 }} className="border-b border-rule" aria-hidden="true" />
          )
        ) : points ? (
          <LineChart
            key={range}
            ariaLabel={`${inst.name} price, ${spec.phrase}. Use the arrow keys to read values.`}
            height={340}
            series={[{ id: "price", points, color: up >= 0 ? "var(--up)" : "var(--down)", area: true }]}
            reference={range === "1D" && q ? { value: q.prevClose, label: "Prev close" } : undefined}
            annotations={annotations}
            yFormat={(v) => formatPrice(v, inst.tick >= 1 ? 1 : inst.tick < 0.05 ? inst.tick : 1)}
            onScrub={setScrub}
          />
        ) : (
          <div style={{ height: 340 }} className="border-b border-rule" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
