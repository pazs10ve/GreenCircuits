import type { Metadata } from "next"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { FO_UNDERLYINGS } from "@/components/fo/chain-model"
import { UnderlyingsTable } from "@/components/fo/underlyings-table"
import { SectionNav } from "@/components/shell/section-nav"

export const metadata: Metadata = {
  title: "Futures and options",
  description: "Option chains for Indian indices and stocks, with open interest, Greeks and a strategy builder.",
}

export default function FoPage() {
  const indices = FO_UNDERLYINGS.filter((i) => i.kind === "INDEX").length
  const stocks = FO_UNDERLYINGS.length - indices

  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-6 pb-20">
      <SectionNav section="explore" />
      <PageHead
        title="Futures and options"
        lede={`Option chains for ${indices} indices and ${stocks} stocks: every strike's price, open interest and Greeks, and a builder that shows what a strategy pays at expiry. Pick an underlying to open its chain.`}
      />

      <div className="mt-12 space-y-16">
        <Section title="Underlyings" description="Weekly options on the Nifty 50 and the Sensex; monthly options on everything else.">
          <UnderlyingsTable />
        </Section>

        <Section title="Before you trade">
          <div className="grid max-w-5xl gap-x-12 gap-y-6 text-[0.9375rem] leading-relaxed text-ink-2 md:grid-cols-3">
            <p>
              <span className="font-semibold text-ink">Most traders lose.</span> SEBI found that 93% of individuals trading equity F&amp;O lost money in the three
              years to March 2024, about ₹2 lakh each on average once costs are counted.
            </p>
            <p>
              <span className="font-semibold text-ink">Lots, not shares.</span> Contracts come in lots worth several lakh rupees. Selling an option can lose many
              times the premium it brings in, which is why brokers ask for a large margin.
            </p>
            <p>
              <span className="font-semibold text-ink">Modelled prices.</span> The chains here are priced with Black-76, from the underlying and India VIX or a
              volatility smile; they aren&apos;t traded quotes, and open interest is sample data.
            </p>
          </div>
        </Section>
      </div>
    </div>
  )
}
