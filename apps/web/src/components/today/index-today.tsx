"use client"

import { useMemo, useState } from "react"
import { LineChart, type ScrubPoint } from "@/components/viz/line-chart"
import { useNow } from "@/hooks/use-now"
import { getInstrument } from "@greencircuits/market/catalog"
import { intradayCandles } from "@greencircuits/market/history"
import { formatNumber, formatPct, formatSigned, formatTimeIST } from "@greencircuits/market/format"
import { useIntradayBars } from "@/lib/data/client"
import { useMarket } from "@/lib/stream/market-context"
import { useQuote, useSession } from "@/lib/stream/hooks"
import { quoteStore } from "@/lib/stream/store"
import { cn } from "@/lib/utils"

/**
 * An index's session so far. The path is rebuilt once a minute and the last
 * point follows the live price, so the line doesn't wobble on every tick.
 */
export function IndexToday({ id, height = 280, className }: { id: number; height?: number; className?: string }) {
  const inst = getInstrument(id)!
  const q = useQuote(id)
  const { mode, initial } = useMarket()
  const intraday = useIntradayBars(id, 5)
  const now = useNow(60_000)
  const [scrub, setScrub] = useState<ScrubPoint | null>(null)
  const { closed } = useSession()
  const minute = now?.getTime() ?? null

  const base = useMemo(() => {
    if (minute == null) return null
    // Live: the session's bars from the database. Demo: a path generated to meet the current price.
    if (mode === "live") return intraday.data?.length ? intraday.data.map((c) => ({ t: c.time, v: c.close })) : null
    const live = quoteStore.get(id) ?? initial.get(id)
    if (!live) return null
    return intradayCandles(inst, live.open, live.ltp, 5, new Date(minute)).map((c) => ({ t: c.time, v: c.close }))
  }, [minute, id, inst, initial, mode, intraday.data])

  const points = useMemo(() => {
    if (!base || !q) return null
    return [...base.slice(0, -1), { t: base.at(-1)!.t, v: q.ltp }]
  }, [base, q])

  const shown = scrub?.values[0] ?? q?.ltp
  const change = shown != null && q ? shown - q.prevClose : undefined
  const pct = change != null && q ? (change / q.prevClose) * 100 : undefined
  const up = (q?.changePct ?? 0) >= 0

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium">{inst.name}</span>
        <span className="figure text-[1.375rem]">{shown != null ? formatNumber(shown, 2) : "–"}</span>
        {change != null && pct != null && (
          <span className={cn("num text-sm", change > 0 ? "text-up" : change < 0 ? "text-down" : "text-ink-2")}>
            {formatSigned(change, 2)} ({formatPct(pct)})
          </span>
        )}
        <span className="text-sm text-ink-3">{scrub ? `at ${formatTimeIST(scrub.t * 1000)}` : closed ? `at the close ${closed}` : "today"}</span>
      </div>
      {points ? (
        <LineChart
          ariaLabel={`${inst.name} ${closed ? `at the close ${closed}` : "today"}, ${q ? formatPct(q.changePct) : ""}. Use the arrow keys to read values.`}
          height={height}
          series={[{ id: "idx", points, color: up ? "var(--up)" : "var(--down)", area: true }]}
          reference={q ? { value: q.prevClose, label: "Prev close" } : undefined}
          yFormat={(v) => formatNumber(v, 0)}
          onScrub={setScrub}
        />
      ) : (
        <div style={{ height }} className="border-b border-rule" aria-hidden="true" />
      )}
    </div>
  )
}
