import { SampleBadge } from "@/components/market/source-badge"
import { Panel } from "@/components/shell/page-header"
import { formatINR } from "@greencircuits/market/format"

/** Sample realised gains for the current financial year, with Indian equity tax rules (from 23 July 2024). */
const REALISED = { stcg: 18420, ltcg: 164300 }
const LTCG_EXEMPTION = 125000
const STCG_RATE = 0.2
const LTCG_RATE = 0.125

export function TaxPanel({ rows }: { rows: { symbol: string; pnl: number }[] }) {
  const stcgTax = REALISED.stcg * STCG_RATE
  const ltcgTaxable = Math.max(0, REALISED.ltcg - LTCG_EXEMPTION)
  const ltcgTax = ltcgTaxable * LTCG_RATE
  const losers = rows.filter((r) => r.pnl < 0).sort((a, b) => a.pnl - b.pnl)
  const harvestable = losers.reduce((s, r) => s - r.pnl, 0)

  return (
    <Panel title="Capital gains, FY 2026–27" description="Listed equity, before surcharge and 4% cess" actions={<SampleBadge />}>
      <div className="grid gap-px bg-border md:grid-cols-3">
        <div className="space-y-2 bg-card p-4">
          <h3 className="text-[11px] font-medium text-muted-foreground">Short-term (held ≤ 12 months)</h3>
          <p className="num text-lg font-semibold">{formatINR(REALISED.stcg, 0)}</p>
          <p className="num text-[11px] text-muted-foreground">
            Taxed at 20% → <span className="text-foreground">{formatINR(stcgTax, 0)}</span>
          </p>
        </div>
        <div className="space-y-2 bg-card p-4">
          <h3 className="text-[11px] font-medium text-muted-foreground">Long-term (held &gt; 12 months)</h3>
          <p className="num text-lg font-semibold">{formatINR(REALISED.ltcg, 0)}</p>
          <p className="num text-[11px] text-muted-foreground">
            First ₹1.25 lakh exempt, rest at 12.5% → <span className="text-foreground">{formatINR(ltcgTax, 0)}</span>
          </p>
        </div>
        <div className="space-y-2 bg-card p-4">
          <h3 className="text-[11px] font-medium text-muted-foreground">Unrealised losses you could book</h3>
          <p className="num text-lg font-semibold text-down">{formatINR(harvestable, 0)}</p>
          <p className="text-[11px] text-muted-foreground">
            {losers.length > 0
              ? `${losers.map((l) => l.symbol).join(", ")}. Booked losses offset gains; short-term losses can offset either kind.`
              : "No holding is below its cost right now."}
          </p>
        </div>
      </div>
      <p className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">
        Illustration only, not tax advice. Grandfathering for shares bought before 1 February 2018 and intraday or F&amp;O income
        (taxed as business income) aren&apos;t included.
      </p>
    </Panel>
  )
}
