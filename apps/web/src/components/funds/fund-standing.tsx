import { formatNumber } from "@greencircuits/market/format"
import { Move } from "@/components/parts/move"
import { RangeMarker } from "@/components/parts/range-marker"
import { Tag } from "@/components/parts/tag"
import type { SchemeRow } from "@/lib/data/funds"
import { PERIODS, median, ordinal, returnsOf } from "./returns"

const pct = (v: number) => `${formatNumber(v, 1)}%`

/** Where a fund sits in its category over each span: its rank, and its return between the worst fund's and the best's. */
export function FundStanding({ scheme, peers }: { scheme: SchemeRow; peers: SchemeRow[] }) {
  const rows = PERIODS.flatMap((p) => {
    const own = scheme[p.key]
    const all = returnsOf(peers, p.key)
    if (own == null || all.length < 3) return []
    const lo = Math.min(own, ...all)
    const hi = Math.max(own, ...all)
    const at = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5)
    const typical = median(all)!
    return [{ ...p, own, lo, hi, typical, at, rank: all.filter((v) => v > own).length + 1, of: all.length }]
  })
  if (rows.length === 0) return <p className="text-sm text-ink-3">Too new to set against the category.</p>
  return (
    <ul className="space-y-5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-xs text-ink-3">{r.per}</span>
            <span className="flex items-center gap-1.5">
              <Tag>
                {ordinal(r.rank)} of {r.of}
              </Tag>
              <Move value={r.own} digits={1} />
            </span>
          </div>
          <RangeMarker
            value={r.at(r.own)}
            mark={r.at(r.typical)}
            left={pct(r.lo)}
            right={pct(r.hi)}
            caption={`typical ${pct(r.typical)}`}
            label={`${ordinal(r.rank)} of ${r.of}: ${pct(r.own)}, against ${pct(r.typical)} for the typical fund`}
          />
        </li>
      ))}
    </ul>
  )
}
