import type { CurvePoint } from "@greencircuits/market/reference"
import { formatNumber, formatSigned } from "@greencircuits/market/format"
import { Figure, Figures } from "@/components/editorial/figures"
import { Bp } from "./bp"

/** The maturities people quote, from a Treasury bill to the long end; those the curve doesn't reach are left out. */
const TENORS = [0.25, 1, 5, 10, 30, 40]
/** Stand-ins, in order, when the curve is short of the quoted ones: six tiles fill the row. */
const FILL = [7, 20, 2, 3, 15, 14, 0.5]

const tenorName = (t: number) => (t < 1 ? `${Math.round(t * 12)} months` : t === 1 ? "1 year" : `${t} years`)

/** The curve read at the maturities people quote, a tile each, with how far each has moved in a month. */
export function KeyYields({ points, className }: { points: CurvePoint[]; className?: string }) {
  const quoted = TENORS.flatMap((t) => {
    const p = points.reduce((best, x) => (Math.abs(x.tenor - t) < Math.abs(best.tenor - t) ? x : best), points[0]!)
    return Math.abs(p.tenor - t) <= Math.max(0.2, t * 0.25) ? [p] : []
  }).filter((p, i, all) => all.findIndex((x) => x.tenor === p.tenor) === i)
  const extra = FILL.flatMap((t) => points.filter((p) => p.tenor === t && !quoted.includes(p)))
  const rows = [...quoted, ...extra].slice(0, 6).sort((a, b) => a.tenor - b.tenor)
  return (
    <Figures aria-label="Key yields" className={className}>
      {rows.map((p) => (
        <Figure
          key={p.tenor}
          label={p.tenor === 10 ? "10 years · benchmark" : tenorName(p.tenor)}
          value={`${formatNumber(p.today, 2)}%`}
          delta={p.monthAgo != null ? <Bp value={(p.today - p.monthAgo) * 100} /> : undefined}
          hint={p.yearAgo != null ? `${formatSigned((p.today - p.yearAgo) * 100, 0)} bp in a year` : undefined}
        />
      ))}
    </Figures>
  )
}
