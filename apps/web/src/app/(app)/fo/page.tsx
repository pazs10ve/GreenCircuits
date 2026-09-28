import type { Metadata } from "next"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import { formatCompact } from "@greencircuits/market/format"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { FO_UNDERLYINGS } from "@/components/fo/chain-model"
import { IndexUnderlyings } from "@/components/fo/index-underlyings"
import { UnderlyingsTable } from "@/components/fo/underlyings-table"
import { ShareBar } from "@/components/parts/share-bar"
import { getFeed } from "@/lib/data/market"

export const metadata: Metadata = {
  title: "Futures and options",
  description: "Option chains for Indian indices and stocks, with open interest, Greeks and a strategy builder.",
}

export default async function FoPage() {
  const indices = FO_UNDERLYINGS.filter((i) => i.kind === "INDEX").length
  const stocks = FO_UNDERLYINGS.length - indices
  const feed = await getFeed()
  const nifty = getInstrument(INDEX.NIFTY)!
  const niftyLot = (feed.quotes?.find((q) => q.id === nifty.id)?.ltp ?? nifty.prevClose) * (nifty.lot ?? 1)

  return (
    <div className="page pt-6 pb-10">
      <PageHead title="Futures and options" lede={`${indices} indices and ${stocks} stocks · modelled option prices, sample open interest`} />
      <IndexUnderlyings />

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <Section className="lg:col-span-8" title="Stocks" description="Monthly options, expiring on the last Tuesday of the month. Pick one to open its chain.">
          <UnderlyingsTable />
        </Section>
        <Section className="lg:col-span-4" title="Before you trade" size="rail">
          <div className="space-y-3">
            <div className="rounded-panel bg-panel p-3.5">
              <p className="flex items-baseline gap-2">
                <span className="figure text-[1.625rem] leading-none">93%</span>
                <span className="text-xs text-ink-3">lost money</span>
              </p>
              <ShareBar
                className="mt-3"
                parts={[
                  { value: 93, className: "bg-ink" },
                  { value: 7, className: "bg-rule-strong" },
                ]}
                label="93 in 100 lost money"
              />
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">
                Of individuals trading equity F&amp;O in the three years to March 2024, by SEBI&apos;s count: about ₹2 lakh each, once costs are counted.
              </p>
            </div>
            <div className="rounded-panel bg-panel p-3.5">
              <p className="flex items-baseline gap-2">
                <span className="figure text-[1.625rem] leading-none">₹{formatCompact(niftyLot, 1)}</span>
                <span className="text-xs text-ink-3">one Nifty lot</span>
              </p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">
                Contracts come in lots, not shares. Selling an option can lose many times the premium it brings in, so brokers ask for a large margin.
              </p>
            </div>
            <div className="rounded-panel bg-panel p-3.5">
              <p className="text-sm font-semibold">Modelled, not traded</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                Chains here are priced with Black-76 from the underlying and India VIX or a volatility smile. Open interest is sample data.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
