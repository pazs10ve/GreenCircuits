import type { Metadata } from "next"
import { COMMODITIES, INDEX, getInstrument, hrefOf } from "@greencircuits/market/catalog"
import { formatNumber } from "@greencircuits/market/format"
import { dailyCandles, sparkline } from "@greencircuits/market/history"
import { COMMODITY_GROUPS } from "@greencircuits/market/reference"
import type { Instrument } from "@greencircuits/market/types"
import { CommodityTiles, type Currency } from "@/components/commodities/commodity-tiles"
import { GoldSilver } from "@/components/commodities/gold-silver"
import { abroad, commodityName, inDollarTerms, unitWords } from "@/components/commodities/units"
import { YearBars } from "@/components/commodities/year-bars"
import { KeyStats } from "@/components/company/key-stats"
import { PricePanel } from "@/components/company/price-panel"
import { PageHead } from "@/components/editorial/page-head"
import { Panel } from "@/components/editorial/panel"
import { Section } from "@/components/editorial/section"
import { SegmentedLinks } from "@/components/market/segmented-links"
import { WatchButton } from "@/components/market/watch-button"
import { Tag } from "@/components/parts/tag"
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

const USDINR = 400

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function CommoditiesPage({ searchParams }: PageProps<"/commodities">) {
  const params = await searchParams
  const inst = COMMODITIES.find((c) => c.slug === one(params.c)?.toLowerCase()) ?? COMMODITIES[0]!
  const currency: Currency = one(params.in) === "usd" ? "usd" : "inr"
  // In dollars, by the unit quoted abroad: gold by the ounce, copper by the pound.
  const dollars = currency === "usd" ? abroad(inst) : null
  const [universe, feed] = await Promise.all([getUniverse(), getFeed()])
  const real = feed.dataset === "real"

  const rows = new Map(universe?.instruments.map((r) => [r.id, r]))
  const sparks: Record<number, number[]> = Object.fromEntries(
    COMMODITIES.flatMap((c) => {
      if (universe) {
        const r = rows.get(c.id)
        return r ? [[c.id, r.spark]] : []
      }
      return [[c.id, sparkline(c, 30)]]
    }),
  )
  // The year's change to the last close the server knows, from the universe or the demo's history.
  const price = (id: number) => feed.quotes?.find((q) => q.id === id)?.ltp ?? getInstrument(id)?.prevClose ?? 0
  const yearAgo = (i: Instrument) => (universe ? (rows.get(i.id)?.yearAgo ?? null) : dailyCandles(i, 251)[0]!.close)
  const nifty = getInstrument(INDEX.NIFTY)!
  // In dollars, each year is seen through the rupee's own year against the dollar.
  const usdinr = getInstrument(USDINR)!
  const fxThen = yearAgo(usdinr)
  const inUsd = currency === "usd" && fxThen != null
  const year = [...COMMODITIES.map((c) => ({ inst: c, bench: false })), { inst: nifty, bench: true }].flatMap(({ inst: i, bench }) => {
    const then = yearAgo(i)
    if (!then) return []
    const pct = (price(i.id) / then - 1) * 100
    return [
      {
        id: i.id,
        name: bench ? i.name : commodityName(i),
        href: bench ? hrefOf(i) : `/commodities?c=${i.slug}${currency === "usd" ? "&in=usd" : ""}`,
        pct: inUsd ? inDollarTerms(pct, fxThen, price(USDINR)) : pct,
        bench,
      },
    ]
  })
  const group = Object.entries(COMMODITY_GROUPS).find(([, symbols]) => symbols.includes(inst.symbol))?.[0]
  const lotUnit = inst.symbol === "GOLD" ? "kilogram" : inst.symbol === "CRUDEOIL" ? "barrels" : inst.symbol === "NATURALGAS" ? "mmBtu" : "kilograms"

  return (
    <div className="page pt-6 pb-10">
      <PageHead
        title="Commodities"
        lede={[
          real ? "COMEX and NYMEX futures" : "Simulated prices",
          currency === "usd" ? "in dollars, by the unit quoted abroad" : "in rupees, in MCX's units",
          "change today",
        ].join(" · ")}
        actions={
          <SegmentedLinks
            aria-label="Currency"
            current={currency}
            options={[
              { value: "inr", label: "₹", href: `/commodities?c=${inst.slug}` },
              { value: "usd", label: "$", href: `/commodities?c=${inst.slug}&in=usd` },
            ]}
          />
        }
      />
      <CommodityTiles sparks={sparks} selected={inst.id} currency={currency} />

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <Panel aria-label={`${inst.name} price`} className="lg:col-span-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">{commodityName(inst)}</h2>
              <Tag>{dollars ? `$ ${dollars.per}` : unitWords(inst)}</Tag>
              {group && <Tag>{group}</Tag>}
            </div>
            <WatchButton instrumentId={inst.id} />
          </div>
          <PricePanel id={inst.id} defaultRange="1Y" currency={dollars ? { id: USDINR, symbol: "$", factor: dollars.factor } : undefined} />
        </Panel>
        <Section title="Key figures" size="rail" className="lg:col-span-4">
          <KeyStats
            id={inst.id}
            currency={dollars ? { id: USDINR, symbol: "$", factor: dollars.factor } : undefined}
            stats={{
              extra: [{ label: "MCX lot", value: formatNumber(inst.lot ?? 0, 0), hint: lotUnit }],
            }}
          />
          <div className="mt-5 border-t border-rule pt-4">
            <h3 className="text-xs text-ink-3">What moves it</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{DRIVERS[inst.symbol]}</p>
          </div>
        </Section>
        {year.length > 1 && (
          <Section
            title="A year, against shares"
            hint={inUsd ? "in dollars" : undefined}
            description={`Each one's change in price over the past year, in ${inUsd ? "dollars" : "rupees"}, beside the Nifty 50's.`}
            className="lg:col-span-8"
          >
            <YearBars rows={year} />
          </Section>
        )}
        <GoldSilver className={year.length > 1 ? "lg:col-span-4" : "lg:col-span-12"} />
      </div>
      <p className="mt-6 text-xs text-ink-3">
        {real
          ? "International futures (gold, silver and copper from COMEX, oil and gas from NYMEX), converted to rupees at the day's exchange rate and quoted in MCX's units. MCX's own prices include import duty, so they run higher."
          : "Simulated prices, quoted the way MCX quotes them."}
      </p>
    </div>
  )
}
