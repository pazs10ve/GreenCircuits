import { formatINR } from "@greencircuits/market/format"

/** Sample realised gains for the current financial year, with Indian equity tax rules (from 23 July 2024). */
const REALISED = { stcg: 18420, ltcg: 164300 }
const LTCG_EXEMPTION = 125000
const STCG_RATE = 0.2
const LTCG_RATE = 0.125

/** Tax on this year's gains, and the losses in the portfolio that could offset them. */
export function TaxPanel({ rows }: { rows: { name: string; pnl: number }[] }) {
  const stcgTax = REALISED.stcg * STCG_RATE
  const ltcgTaxable = Math.max(0, REALISED.ltcg - LTCG_EXEMPTION)
  const ltcgTax = ltcgTaxable * LTCG_RATE
  const losers = rows.filter((r) => r.pnl < 0).sort((a, b) => a.pnl - b.pnl)
  const harvestable = losers.reduce((s, r) => s - r.pnl, 0)

  return (
    <div>
      <dl className="grid gap-x-10 gap-y-8 md:grid-cols-3">
        <div className="border-t border-rule pt-3">
          <dt className="text-[13px] text-ink-3">Short-term gains, held a year or less</dt>
          <dd className="figure mt-1.5 text-[1.625rem] leading-none">{formatINR(REALISED.stcg, 0)}</dd>
          <dd className="num mt-2 text-sm text-ink-2">
            Taxed at 20%: <span className="text-ink">{formatINR(stcgTax, 0)}</span>
          </dd>
        </div>
        <div className="border-t border-rule pt-3">
          <dt className="text-[13px] text-ink-3">Long-term gains, held over a year</dt>
          <dd className="figure mt-1.5 text-[1.625rem] leading-none">{formatINR(REALISED.ltcg, 0)}</dd>
          <dd className="num mt-2 text-sm text-ink-2">
            The first ₹1.25 lakh is free, the rest at 12.5%: <span className="text-ink">{formatINR(ltcgTax, 0)}</span>
          </dd>
        </div>
        <div className="border-t border-rule pt-3">
          <dt className="text-[13px] text-ink-3">Losses you could book</dt>
          <dd className="figure mt-1.5 text-[1.625rem] leading-none text-down">{formatINR(harvestable, 0)}</dd>
          <dd className="mt-2 text-sm leading-relaxed text-ink-2">
            {losers.length > 0
              ? `In ${losers.map((l) => l.name).join(", ")}. Booked losses offset gains, and short-term losses can offset either kind.`
              : "No holding is below what it cost."}
          </dd>
        </div>
      </dl>
      <p className="mt-6 text-sm leading-relaxed text-ink-3">
        The gains are sample figures; the losses come from the holdings above. An illustration, not tax advice: it leaves out surcharge and the 4% cess,
        grandfathering for shares bought before 1 February 2018, and intraday or F&amp;O income, which is taxed as business income.
      </p>
    </div>
  )
}
