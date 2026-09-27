import type { Metadata } from "next"
import { COMMODITIES } from "@greencircuits/market/catalog"
import { formatNumber, formatPrice } from "@greencircuits/market/format"
import { fiftyTwoWeek, sparkline } from "@greencircuits/market/history"
import { CommoditiesLede } from "@/components/commodities/commodities-lede"
import { CommodityTable, type CommodityStatic } from "@/components/commodities/commodity-table"
import { unitWords } from "@/components/commodities/units"
import { PricePanel } from "@/components/company/price-panel"
import { Figure, Figures } from "@/components/editorial/figures"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { WatchButton } from "@/components/market/watch-button"
import { SectionNav } from "@/components/shell/section-nav"
import { getFeed } from "@/lib/data/market"
import { getUniverse } from "@/lib/data/universe"

export const metadata: Metadata = {
  title: "Commodities",
  description: "Gold, silver, crude oil, natural gas and base metals in rupees, with charts and what moves each price.",
}

/** What drives each price, in a paragraph. */
const DRIVERS: Record<string, string> = {
  GOLD: "Interest rates and the dollar, above all. Gold pays no interest, so it gains when rates fall, when the dollar weakens and when markets are frightened. Central banks have been big buyers for years. In India the rupee and import duty add moves of their own.",
  SILVER:
    "Half precious metal, half industrial. Silver follows gold in a scare and factory demand, from solar panels to electronics, the rest of the time, and it usually moves about twice as much as gold does.",
  CRUDEOIL:
    "Supply decisions by OPEC and its allies, the pace of the world economy, and wars or sanctions near oil fields. India imports most of the oil it uses, so crude also moves the rupee and inflation here.",
  NATURALGAS:
    "The weather, more than anything: cold winters and hot summers in the United States drive this benchmark, along with how full storage is and how much gas is shipped abroad as LNG. It swings more than anything else here.",
  COPPER: "Building and electrification: wiring, motors, power grids and electric cars all use it. China uses about half the world's copper, so its economy sets the tone.",
  ZINC: "Mostly used to galvanise steel against rust, so it follows construction and car making, and how much the big mines in China, Peru and Australia produce.",
  ALUMINIUM:
    "Smelting it takes a great deal of electricity, so power prices matter as much as demand from cars, packaging and building. China makes more than half the world's supply.",
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function CommoditiesPage({ searchParams }: PageProps<"/commodities">) {
  const params = await searchParams
  const inst = COMMODITIES.find((c) => c.slug === one(params.c)?.toLowerCase()) ?? COMMODITIES[0]!
  const [universe, { dataset }] = await Promise.all([getUniverse(), getFeed()])

  const rows = new Map(universe?.instruments.map((r) => [r.id, r]))
  const statics: CommodityStatic[] = COMMODITIES.flatMap((c) => {
    if (universe) {
      const r = rows.get(c.id)
      return r ? [{ id: c.id, spark: r.spark, low52: r.low52, high52: r.high52 }] : []
    }
    const year = fiftyTwoWeek(c)
    return [{ id: c.id, spark: sparkline(c, 30), low52: year.low, high52: year.high }]
  })
  const year = statics.find((s) => s.id === inst.id)
  const usualMove = (inst.vol / Math.sqrt(252)) * 100

  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-6 pb-20">
      <SectionNav section="explore" />
      <PageHead title="Commodities" serif lede={<CommoditiesLede />} />
      <p className="mt-3 max-w-[46rem] text-sm text-ink-3">
        {dataset === "real"
          ? "International futures (gold, silver and copper from COMEX, oil and gas from NYMEX), converted to rupees at the day's exchange rate and quoted in MCX's units. MCX's own prices include import duty, so they run higher."
          : "Simulated prices, quoted the way MCX quotes them."}
      </p>

      <div className="mt-14 space-y-16">
        <Section title="Prices" description="Bullion, energy and base metals. Pick one to see it in full.">
          <CommodityTable data={statics} selected={inst.id} />
        </Section>

        <Section id="detail" title={inst.name} description={`Quoted in ${unitWords(inst).replace("₹ per", "rupees per")}.`} action={<WatchButton instrumentId={inst.id} />}>
          <PricePanel id={inst.id} defaultRange="1Y" />
          <div className="mt-12 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div>
              <h3 className="text-sm font-semibold">What moves it</h3>
              <p className="mt-2 max-w-[40em] font-serif text-[1.125rem] leading-relaxed text-ink-2">{DRIVERS[inst.symbol]}</p>
            </div>
            <Figures className="self-start sm:grid-cols-2 lg:grid-cols-2">
              <Figure label="Usual daily move" value={`${formatNumber(usualMove, 1)}%`} hint="one standard deviation" />
              <Figure label="MCX lot" value={formatNumber(inst.lot ?? 0, 0)} hint={inst.symbol === "GOLD" ? "kilogram" : inst.symbol === "CRUDEOIL" ? "barrels" : inst.symbol === "NATURALGAS" ? "mmBtu" : "kilograms"} />
              {year && (
                <Figure
                  label="52-week range"
                  value={`₹${formatPrice(year.low52, inst.tick)}`}
                  hint={`to ₹${formatPrice(year.high52, inst.tick)}`}
                  className="col-span-2 sm:col-span-2"
                />
              )}
            </Figures>
          </div>
        </Section>
      </div>
    </div>
  )
}
