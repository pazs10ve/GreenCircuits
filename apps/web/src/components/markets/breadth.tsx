"use client"

import { useMemo } from "react"
import { SIZE_BANDS } from "@greencircuits/market/catalog"
import { formatNumber } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { Meter } from "@/components/parts/meter"
import { Move } from "@/components/parts/move"
import { ShareBar } from "@/components/parts/share-bar"
import type { MarketRow } from "./market-rows"

function Share({ label, pct }: { label: string; pct: number | null }) {
  return (
    <div>
      <p className="mb-2 flex items-baseline justify-between gap-3 text-xs text-ink-3">
        <span>{label}</span>
        <span className="figure text-[1.125rem] leading-none text-ink">{pct == null ? "–" : `${formatNumber(pct, 0)}%`}</span>
      </p>
      <Meter value={(pct ?? 0) / 100} />
    </div>
  )
}

/**
 * How broad the day's move is: how many stocks rose and fell, how many are
 * above their 50- and 200-day averages, how many made a new high or low, and
 * how big companies did against small ones.
 */
export function Breadth({ rows }: { rows: MarketRow[] }) {
  const read = useQuoteReader(3000)
  const b = useMemo(() => {
    let up = 0
    let down = 0
    let flat = 0
    let above50 = 0
    let with50 = 0
    let above200 = 0
    let with200 = 0
    let highs = 0
    let lows = 0
    const bands = new Map<string, { weight: number; sum: number }>()
    for (const r of rows) {
      const q = read(r.id)
      if (!q) continue
      if (q.changePct > 0.05) up++
      else if (q.changePct < -0.05) down++
      else flat++
      if (r.sma50 != null) {
        with50++
        if (q.ltp > r.sma50) above50++
      }
      if (r.sma200 != null) {
        with200++
        if (q.ltp > r.sma200) above200++
      }
      // Against the range before today: a new high is a trade above the old one.
      if (r.high52 != null && q.high > r.high52) highs++
      if (r.low52 != null && q.low < r.low52) lows++
      if (r.size) {
        const e = bands.get(r.size) ?? { weight: 0, sum: 0 }
        e.weight += r.mcapCr
        e.sum += r.mcapCr * q.changePct
        bands.set(r.size, e)
      }
    }
    return {
      up,
      down,
      flat,
      total: up + down + flat,
      above50: with50 ? (above50 / with50) * 100 : null,
      above200: with200 ? (above200 / with200) * 100 : null,
      highs,
      lows,
      bands: SIZE_BANDS.map((band) => {
        const e = bands.get(band)
        return { band, pct: e && e.weight > 0 ? e.sum / e.weight : null }
      }),
    }
  }, [rows, read])

  return (
    <div className="space-y-5">
      <div>
        <div className="flex justify-between text-xs text-ink-3">
          <span>Rising</span>
          <span>Falling</span>
        </div>
        <div className="mt-1 mb-2.5 flex justify-between">
          <span className="figure text-[1.5rem] leading-none text-up">{b.up}</span>
          <span className="figure text-[1.5rem] leading-none text-down">{b.down}</span>
        </div>
        <ShareBar
          label={`${b.up} of ${b.total} rising, ${b.down} falling`}
          parts={[
            { value: b.up, className: "bg-up" },
            { value: b.flat, className: "bg-rule-strong" },
            { value: b.down, className: "bg-down" },
          ]}
        />
      </div>
      <Share label="Above their 50-day average" pct={b.above50} />
      <Share label="Above their 200-day average" pct={b.above200} />
      <div>
        <div className="flex justify-between text-xs text-ink-3">
          <span>New 52-week highs</span>
          <span>New lows</span>
        </div>
        <div className="mt-1 mb-2.5 flex justify-between">
          <span className="figure text-[1.25rem] leading-none">{b.highs}</span>
          <span className="figure text-[1.25rem] leading-none">{b.lows}</span>
        </div>
        <ShareBar
          height={6}
          label={`${b.highs} new highs, ${b.lows} new lows`}
          parts={[
            { value: b.highs || 0.001, className: "bg-up" },
            { value: b.lows || 0.001, className: "bg-down" },
          ]}
        />
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {b.bands.map(({ band, pct }) => (
          <div key={band} className="rounded-panel bg-panel p-3">
            <dt className="text-xs text-ink-3">{band} caps</dt>
            <dd className="mt-1.5">
              <Move value={pct} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
