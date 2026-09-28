"use client"

import { useMemo, useState } from "react"
import { LineChart, type ScrubPoint } from "@/components/viz/line-chart"
import { Move } from "@/components/parts/move"
import { RangeMarker } from "@/components/parts/range-marker"
import { Tag } from "@/components/parts/tag"
import { Skeleton } from "@/components/ui/skeleton"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import { formatNumber } from "@greencircuits/market/format"
import { dailyCandles } from "@greencircuits/market/history"
import { useDailyBars } from "@/lib/data/client"
import { useQuote } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"

/** The scale fear is read on: under 15 is calm, over 20 nervous. */
const LO = 10
const HI = 30

const dateText = (t: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(t * 1000)

/** Where fear sits now against the past year: India VIX, with the level above which the market is nervous. */
export function VixChart() {
  const inst = getInstrument(INDEX.VIX)!
  const { mode } = useMarket()
  const q = useQuote(INDEX.VIX)
  const daily = useDailyBars(INDEX.VIX, 250)
  const [scrub, setScrub] = useState<ScrubPoint | null>(null)
  const points = useMemo(() => {
    const bars = mode === "live" ? daily.data : dailyCandles(inst, 250)
    return bars?.length ? bars.map((b) => ({ t: b.time, v: b.close })) : null
  }, [mode, daily.data, inst])
  if (!points) return <Skeleton className="h-[260px]" />
  const shown = scrub?.values[0] ?? q?.ltp ?? points.at(-1)!.v
  const values = points.map((p) => p.v)
  const mood = shown < 13 ? "Calm" : shown < 17 ? "Settled" : shown < 22 ? "Uneasy" : "Fearful"
  return (
    <figure>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="figure text-[2rem] leading-none">{formatNumber(shown, 2)}</span>
        {scrub ? <span className="text-[13px] text-ink-3">{dateText(scrub.t)}</span> : <Move value={q?.changePct} digits={1} />}
        <Tag tone={shown < 15 ? "up" : shown > 20 ? "down" : "neutral"}>{mood}</Tag>
      </figcaption>
      <RangeMarker
        className="mt-4"
        value={(shown - LO) / (HI - LO)}
        left={`${LO}, calm`}
        right={`${HI}, nervous`}
        label={`India VIX at ${formatNumber(shown, 1)}; a year's range ${formatNumber(Math.min(...values), 1)} to ${formatNumber(Math.max(...values), 1)}`}
        zones={[
          { from: 0, to: (15 - LO) / (HI - LO), className: "bg-up-soft" },
          { from: (20 - LO) / (HI - LO), to: 1, className: "bg-down-soft" },
        ]}
      />
      <LineChart
        className="mt-4"
        series={[{ id: "vix", points, color: "var(--ink)", area: true }]}
        height={190}
        reference={{ value: 20, label: "Nervous" }}
        yFormat={(v) => formatNumber(v, 0)}
        onScrub={setScrub}
        ariaLabel={`India VIX over the past year, now ${formatNumber(shown, 1)}.`}
      />
    </figure>
  )
}
