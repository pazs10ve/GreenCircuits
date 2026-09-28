import { formatNumber } from "@greencircuits/market/format"
import type { SchemeRow } from "@/lib/data/funds"
import { cn } from "@/lib/utils"
import { median, type Period } from "./returns"
import { swarm } from "./swarm"

const pct = (v: number) => `${formatNumber(v, 1)}%`

/** How far apart the lanes sit. */
const PITCH = 8
/** How close two dots in a lane may come, as a share of the width. */
const GAP = 0.009
/** Room over the dots for the two labelled lines. */
const HEAD = 34

/** Round steps for an axis of returns. */
function ticks(lo: number, hi: number) {
  const span = hi - lo
  const step = span <= 8 ? 1 : span <= 16 ? 2 : span <= 40 ? 5 : span <= 80 ? 10 : 20
  const out: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t)
  return out
}

/** A label over its line: centred, or held in at the ends so it isn't cut off. */
const anchor = (x: number) => (x < 0.12 ? "-translate-x-1" : x > 0.88 ? "-translate-x-[calc(100%_-_4px)]" : "-translate-x-1/2")

/**
 * A category at a glance, on a panel: every fund's return as a dot, the typical fund's as
 * a line, and the index's in the benchmark's blue, with the funds that beat
 * it in ink and the rest in grey.
 */
export function CategoryStrip({ schemes, period, index }: { schemes: SchemeRow[]; period: Period; index: { name: string; value: number | null } | null }) {
  const dots = schemes.flatMap((s) => (s[period.key] == null ? [] : [{ code: s.code, name: s.name, v: s[period.key]! }])).sort((a, b) => a.v - b.v)
  if (dots.length < 3) return null
  const typical = median(dots.map((d) => d.v))!
  const bench = index?.value ?? null
  const lo = Math.min(dots[0]!.v, bench ?? Infinity)
  const hi = Math.max(dots.at(-1)!.v, bench ?? -Infinity)
  const pad = (hi - lo || 1) * 0.03
  const X = (v: number) => (v - (lo - pad)) / (hi - lo + 2 * pad)

  const lanes = swarm(
    dots.map((d) => X(d.v)),
    GAP,
  )
  const placed = dots.map((d, i) => ({ ...d, x: X(d.v), lane: lanes[i]! }))
  // The band the dots sit in: as tall as the lanes they took.
  const band = (Math.max(...placed.map((p) => Math.abs(p.lane))) * 2 + 1) * PITCH + 10
  const beat = bench != null ? dots.filter((d) => d.v > bench).length : null
  const at = (v: number) => ({ left: `${X(v) * 100}%` })

  return (
    <figure>
      <div
        className="relative"
        style={{ height: HEAD + band }}
        role="img"
        aria-label={`${dots.length} funds, ${period.per.toLowerCase()}: the typical one ${pct(typical)}${bench != null ? `, the ${index!.name} ${pct(bench)}, and ${beat} funds beat it` : ""}`}
      >
        {bench != null && <span className="absolute bottom-0 w-[1.5px] -translate-x-1/2 bg-bench" style={{ ...at(bench), top: 12 }} />}
        <span className="absolute bottom-0 w-[1.5px] -translate-x-1/2 bg-ink" style={{ ...at(typical), top: 29 }} />
        <div className="absolute inset-x-0 bottom-0" style={{ height: band }}>
          {placed.map((p) => (
            <span
              key={p.code}
              title={`${p.name}: ${pct(p.v)}`}
              className={cn(
                "absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full",
                bench == null ? "bg-ink-3/60" : p.v > bench ? "bg-ink" : "bg-rule-strong",
              )}
              style={{ left: `${p.x * 100}%`, top: band / 2 + p.lane * PITCH }}
            />
          ))}
        </div>
        {bench != null && (
          <span className={cn("absolute top-0 rounded-sm bg-panel px-1 text-[11px] leading-[14px] font-semibold whitespace-nowrap text-bench", anchor(X(bench)))} style={at(bench)}>
            {index!.name} {pct(bench)}
          </span>
        )}
        <span className={cn("absolute top-[16px] rounded-sm bg-panel px-1 text-[11px] leading-[14px] font-semibold whitespace-nowrap text-ink", anchor(X(typical)))} style={at(typical)}>
          Typical {pct(typical)}
        </span>
      </div>
      <div className="relative mt-1 h-4 border-t border-rule" aria-hidden="true">
        {ticks(lo - pad, hi + pad).map((t) => (
          <span key={t} className="num absolute top-1 -translate-x-1/2 text-[11px] leading-none text-ink-3" style={at(t)}>
            {t}%
          </span>
        ))}
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-ink-3">
        <span>
          {beat != null ? (
            <>
              <span className="font-semibold text-ink">
                {beat} of {dots.length}
              </span>{" "}
              beat the {index!.name}
            </>
          ) : (
            `${dots.length} funds`
          )}
        </span>
        <span>Each dot a fund · {period.per.toLowerCase()}</span>
      </figcaption>
    </figure>
  )
}
