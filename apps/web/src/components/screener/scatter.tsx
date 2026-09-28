"use client"

import { useElementSize } from "@/hooks/use-element-size"
import { getField, type LiveRow } from "./fields"

const H = 250
const M = { left: 36, right: 10, top: 12, bottom: 24 }
const PE_MAX = 60
const ROE = { lo: -10, hi: 50 }

/**
 * The screen as a picture: every company by its P/E and its return on
 * equity, the ones that match in ink, the rest in grey, so a reader sees
 * where the screen falls in the whole market.
 */
export function ScreenScatter({ all, matches }: { all: LiveRow[]; matches: LiveRow[] }) {
  const [ref, { width }] = useElementSize<HTMLDivElement>()
  const pe = getField("pe")
  const roe = getField("roe")
  const matched = new Set(matches.map((m) => m.id))
  const plotW = Math.max(0, width - M.left - M.right)
  const X = (v: number) => M.left + (Math.min(v, PE_MAX) / PE_MAX) * plotW
  const Y = (v: number) => M.top + (1 - (Math.min(Math.max(v, ROE.lo), ROE.hi) - ROE.lo) / (ROE.hi - ROE.lo)) * (H - M.top - M.bottom)
  const points = all.flatMap((r) => {
    const x = pe.get(r)
    const y = roe.get(r)
    return typeof x === "number" && typeof y === "number" && x > 0 ? [{ id: r.id, x, y, on: matched.has(r.id) }] : []
  })
  return (
    <div ref={ref} style={{ height: H }}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label={`${matches.length} matching companies among ${points.length}, by P/E and return on equity`} className="block overflow-visible">
          {[0, 10, 20, 30, 40, 50].map((v) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={Y(v)} y2={Y(v)} style={{ stroke: v === 0 ? "var(--rule-strong)" : "var(--rule)" }} strokeDasharray={v === 0 ? undefined : "1 5"} strokeLinecap="round" />
              <text x={M.left - 8} y={Y(v) + 4} fontSize={11} textAnchor="end" className="num" style={{ fill: "var(--ink-3)" }}>
                {v}%
              </text>
            </g>
          ))}
          {[0, 10, 20, 30, 40, 50, 60].map((v) => (
            <text key={v} x={X(v)} y={H - 6} fontSize={11} textAnchor="middle" className="num" style={{ fill: "var(--ink-3)" }}>
              {v === PE_MAX ? `${v}×+` : `${v}×`}
            </text>
          ))}
          {points
            .filter((p) => !p.on)
            .map((p) => (
              <circle key={p.id} cx={X(p.x)} cy={Y(p.y)} r={3} style={{ fill: "var(--rule-strong)" }} />
            ))}
          {points
            .filter((p) => p.on)
            .map((p) => (
              <circle key={p.id} cx={X(p.x)} cy={Y(p.y)} r={4} strokeWidth={1.5} style={{ fill: "var(--ink)", stroke: "var(--paper)" }} />
            ))}
          <text x={width - M.right} y={H - 22} fontSize={11} fontWeight={600} textAnchor="end" style={{ fill: "var(--ink-2)" }}>
            P/E →
          </text>
          <text x={M.left + 4} y={M.top - 2} fontSize={11} fontWeight={600} style={{ fill: "var(--ink-2)" }}>
            ↑ Return on equity
          </text>
        </svg>
      )}
    </div>
  )
}
