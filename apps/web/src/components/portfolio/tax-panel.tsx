import { formatINR } from "@greencircuits/market/format"
import { Figure } from "@/components/editorial/figures"
import { RangeMarker } from "@/components/parts/range-marker"
import { Tag } from "@/components/parts/tag"

/** Sample realised gains for the current financial year, with Indian equity tax rules (from 23 July 2024). */
const REALISED = { stcg: 18420, ltcg: 164300 }
const LTCG_EXEMPTION = 125000
const STCG_RATE = 0.2
const LTCG_RATE = 0.125

/** How much of the year's tax-free long-term gain is used, the tax on the rest, and the losses in the portfolio that could offset it. */
export function TaxPanel({ rows }: { rows: { name: string; pnl: number }[] }) {
  const stcgTax = REALISED.stcg * STCG_RATE
  const ltcgTaxable = Math.max(0, REALISED.ltcg - LTCG_EXEMPTION)
  const ltcgTax = ltcgTaxable * LTCG_RATE
  const losers = rows.filter((r) => r.pnl < 0).sort((a, b) => a.pnl - b.pnl)
  const harvestable = losers.reduce((s, r) => s - r.pnl, 0)
  const room = LTCG_EXEMPTION - REALISED.ltcg

  return (
    <div>
      <p className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-ink-3">
        <span>Tax-free long-term gain used this year</span>
        <span className="num font-semibold text-ink">
          {formatINR(Math.min(REALISED.ltcg, LTCG_EXEMPTION), 0)} of {formatINR(LTCG_EXEMPTION, 0)}
        </span>
      </p>
      <RangeMarker
        value={Math.min(1, REALISED.ltcg / LTCG_EXEMPTION)}
        left="₹0"
        right="₹1.25 lakh"
        zones={[{ from: 0, to: Math.min(1, REALISED.ltcg / LTCG_EXEMPTION), className: "bg-ink" }]}
        label={`${formatINR(REALISED.ltcg, 0)} of long-term gains against the ${formatINR(LTCG_EXEMPTION, 0)} that is tax-free`}
      />
      <div className="mt-4">
        {room > 0 ? (
          <Tag tone="up">{formatINR(room, 0)} more can be taken tax-free</Tag>
        ) : (
          <Tag tone="attn">{formatINR(-room, 0)} over the tax-free limit</Tag>
        )}
      </div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-3">
        <Figure variant="panel" size="sm" label="Short-term gains" value={formatINR(REALISED.stcg, 0)} hint={`${formatINR(stcgTax, 0)} tax at 20%`} />
        <Figure variant="panel" size="sm" label="Long-term gains" value={formatINR(REALISED.ltcg, 0)} hint={`${formatINR(ltcgTax, 0)} tax at 12.5% over ₹1.25 lakh`} />
        <Figure
          variant="panel"
          size="sm"
          label="Losses you could book"
          value={formatINR(harvestable, 0)}
          tone={harvestable > 0 ? "down" : undefined}
          hint={losers.length > 0 ? `In ${losers.map((l) => l.name).join(", ")}` : "No holding is below its cost"}
        />
      </dl>
    </div>
  )
}
