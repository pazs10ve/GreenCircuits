import { formatSigned } from "@greencircuits/market/format"
import { Figure } from "@/components/editorial/figures"
import { Meter } from "@/components/parts/meter"
import { Tag } from "@/components/parts/tag"

/** How the long end sits against the short: upward is the usual shape, since lending for longer asks for more. */
const shapeOf = (bp: number) => (bp > 20 ? "Upward" : bp < -10 ? "Inverted" : "Flat")

/** What each kind of borrower pays over the government, as bars, and how steep the government's own curve is. */
export function Spreads({ rows, slope }: { rows: { label: string; bp: number }[]; slope: { label: string; bp: number } | null }) {
  const max = Math.max(1, ...rows.map((r) => r.bp))
  return (
    <div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">Too few bonds have a yield today to say.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {rows.map((r) => (
            <li key={r.label} className="py-2.5 first:pt-0">
              <div className="mb-2 flex items-center justify-between gap-3 text-[13px]">
                <span className="text-ink-2">{r.label}</span>
                <span className="num font-semibold">{formatSigned(r.bp, 0)} bp</span>
              </div>
              <Meter value={Math.max(0, r.bp) / max} />
            </li>
          ))}
        </ul>
      )}
      {slope != null && (
        <dl className="mt-4">
          <Figure variant="panel" size="sm" label={slope.label} value={`${formatSigned(slope.bp, 0)} bp`} delta={<Tag>{shapeOf(slope.bp)}</Tag>} />
        </dl>
      )}
    </div>
  )
}
