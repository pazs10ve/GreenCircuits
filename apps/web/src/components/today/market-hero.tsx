"use client"

import { useMemo, useState } from "react"
import { MoreLink } from "@/components/editorial/section"
import { Meter } from "@/components/parts/meter"
import { Move } from "@/components/parts/move"
import { RangeMarker } from "@/components/parts/range-marker"
import { ShareBar } from "@/components/parts/share-bar"
import { LineChart, type ScrubPoint } from "@/components/viz/line-chart"
import { useNow } from "@/hooks/use-now"
import { EQUITIES, INDEX, getInstrument, hrefOf } from "@greencircuits/market/catalog"
import { intradayCandles } from "@greencircuits/market/history"
import { formatNumber, formatPct, formatSigned, formatTimeIST } from "@greencircuits/market/format"
import { useIntradayBars } from "@/lib/data/client"
import { useMarket } from "@/lib/stream/market-context"
import { useQuote, useQuoteReader, useSession } from "@/lib/stream/hooks"
import { quoteStore } from "@/lib/stream/store"
import { cn } from "@/lib/utils"

/** The VIX's scale: calm under 15, nervous over 20. */
const VIX = { lo: 10, hi: 30, calm: 15, nervous: 20 }
const onVix = (v: number) => (v - VIX.lo) / (VIX.hi - VIX.lo)

/**
 * The front page's lead: the Nifty 50's day as a big figure and its session
 * so far, then three readings of the whole market under it: how many
 * companies rose, how many sit above their long-run average, and fear.
 * `sma200` is each company's 200-day average, from the screener.
 */
export function MarketHero({ date, sma200 }: { date: string; sma200: [number, number][] }) {
  const inst = getInstrument(INDEX.NIFTY)!
  const q = useQuote(INDEX.NIFTY)
  const vix = useQuote(INDEX.VIX)
  const read = useQuoteReader(3000)
  const { mode, initial } = useMarket()
  const intraday = useIntradayBars(INDEX.NIFTY, 5)
  const now = useNow(60_000)
  const [scrub, setScrub] = useState<ScrubPoint | null>(null)
  const { closed } = useSession()
  const minute = now?.getTime() ?? null

  const base = useMemo(() => {
    if (minute == null) return null
    // Live: the session's bars from the database. Demo: a path generated to meet the current price.
    if (mode === "live") return intraday.data?.length ? intraday.data.map((c) => ({ t: c.time, v: c.close })) : null
    const live = quoteStore.get(INDEX.NIFTY) ?? initial.get(INDEX.NIFTY)
    if (!live) return null
    return intradayCandles(inst, live.open, live.ltp, 5, new Date(minute)).map((c) => ({ t: c.time, v: c.close }))
  }, [minute, inst, initial, mode, intraday.data])
  // The path is rebuilt once a minute; its last point follows the live price, so the line doesn't wobble on every tick.
  const points = useMemo(() => (base && q ? [...base.slice(0, -1), { t: base.at(-1)!.t, v: q.ltp }] : null), [base, q])

  const breadth = useMemo(() => {
    let up = 0
    let down = 0
    let flat = 0
    for (const e of EQUITIES) {
      const x = read(e.id)
      if (!x) continue
      if (x.changePct > 0) up++
      else if (x.changePct < 0) down++
      else flat++
    }
    let above = 0
    let known = 0
    for (const [id, sma] of sma200) {
      const x = read(id)
      if (!x) continue
      known++
      if (x.ltp > sma) above++
    }
    return { up, down, flat, above200: known ? (above / known) * 100 : null }
  }, [read, sma200])

  const shown = scrub?.values[0] ?? q?.ltp
  const change = shown != null && q ? shown - q.prevClose : undefined
  const pct = change != null && q ? (change / q.prevClose) * 100 : undefined
  const up = (q?.changePct ?? 0) >= 0

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-3">
            <span className="font-semibold text-ink-2">{inst.name}</span> · {date}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="figure text-[2.25rem] leading-none md:text-[2.75rem]">{shown != null ? formatNumber(shown, 2) : "–"}</span>
            <Move value={pct} size="md" />
            {change != null && <span className={cn("num text-sm font-semibold", change >= 0 ? "text-up" : "text-down")}>{formatSigned(change, 2)}</span>}
            <span className="text-[13px] text-ink-3">{scrub ? `at ${formatTimeIST(scrub.t * 1000)}` : closed ? `at the close, ${closed}` : "today"}</span>
          </div>
        </div>
        <MoreLink href={hrefOf(inst)}>Open</MoreLink>
      </div>
      <div className="mt-4">
        {points ? (
          <LineChart
            ariaLabel={`${inst.name} ${closed ? `at the close ${closed}` : "today"}, ${q ? formatPct(q.changePct) : ""}. Use the arrow keys to read values.`}
            height={220}
            series={[{ id: "idx", points, color: up ? "var(--up)" : "var(--down)", area: true }]}
            reference={q ? { value: q.prevClose, label: "Prev close" } : undefined}
            yFormat={(v) => formatNumber(v, 0)}
            onScrub={setScrub}
          />
        ) : (
          <div style={{ height: 220 }} aria-hidden="true" />
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-panel bg-panel p-3">
          <div className="flex justify-between text-xs text-ink-3">
            <span>Rising</span>
            <span>Falling</span>
          </div>
          <div className="mt-1 mb-2.5 flex justify-between">
            <span className="figure text-[1.25rem] leading-none text-up">{breadth.up}</span>
            <span className="figure text-[1.25rem] leading-none text-down">{breadth.down}</span>
          </div>
          <ShareBar
            height={6}
            label={`${breadth.up} of the Nifty 500 rising and ${breadth.down} falling`}
            parts={[
              { value: breadth.up, className: "bg-up" },
              { value: breadth.flat, className: "bg-rule-strong" },
              { value: breadth.down, className: "bg-down" },
            ]}
          />
        </div>
        <div className="rounded-panel bg-panel p-3">
          <p className="text-xs text-ink-3">Above their 200-day average</p>
          <p className="figure mt-1 mb-2.5 text-[1.25rem] leading-none">{breadth.above200 != null ? `${formatNumber(breadth.above200, 0)}%` : "–"}</p>
          <Meter value={(breadth.above200 ?? 0) / 100} />
        </div>
        <div className="rounded-panel bg-panel p-3">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>India VIX</span>
            <Move value={vix?.changePct} digits={1} />
          </div>
          <p className="figure mt-1 mb-2.5 text-[1.25rem] leading-none">{vix ? formatNumber(vix.ltp, 2) : "–"}</p>
          <RangeMarker
            value={vix ? onVix(vix.ltp) : 0}
            label={vix ? `India VIX at ${formatNumber(vix.ltp, 1)}: ${vix.ltp < VIX.calm ? "calm" : vix.ltp > VIX.nervous ? "nervous" : "normal"}` : undefined}
            zones={[
              { from: 0, to: onVix(VIX.calm), className: "bg-up-soft" },
              { from: onVix(VIX.nervous), to: 1, className: "bg-down-soft" },
            ]}
          />
        </div>
      </div>
    </>
  )
}
