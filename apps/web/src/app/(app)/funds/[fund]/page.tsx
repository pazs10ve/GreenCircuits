import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { InstrumentHeader } from "@/components/company/instrument-header"
import { KeyStats } from "@/components/company/key-stats"
import { PricePanel } from "@/components/company/price-panel"
import { StickySummary } from "@/components/company/sticky-summary"
import { Figure, Figures, toneOf } from "@/components/editorial/figures"
import { Panel } from "@/components/editorial/panel"
import { Section } from "@/components/editorial/section"
import { listedFundStatics, type FundStatic } from "@/components/funds/data"
import { MutualFundPage } from "@/components/funds/mutual-fund-page"
import { ListedTable } from "@/components/funds/listed-table"
import { TestIt } from "@/components/lab/test-it"
import { Tag } from "@/components/parts/tag"
import { ETFS, getInstrument, getInstrumentBySlug, isListedFund } from "@greencircuits/market/catalog"
import { dailyCandles } from "@greencircuits/market/history"
import type { Instrument } from "@greencircuits/market/types"
import { formatPct, formatSigned } from "@greencircuits/market/format"
import { getScheme } from "@/lib/data/funds"
import { getFeed } from "@/lib/data/market"
import { getUniverse } from "@/lib/data/universe"

const KIND_NAMES: Record<string, string> = { ETF: "ETF", REIT: "REIT", INVIT: "InvIT" }

function listedFund(segment: string): Instrument | undefined {
  const inst = getInstrumentBySlug(segment)
  return inst && isListedFund(inst) ? inst : undefined
}

/** A mutual fund's page is its AMFI scheme code; a listed fund's, its symbol. */
const isSchemeCode = (segment: string) => /^\d{3,7}$/.test(segment)

export async function generateMetadata({ params }: PageProps<"/funds/[fund]">): Promise<Metadata> {
  const { fund } = await params
  if (isSchemeCode(fund)) {
    const data = await getScheme(Number(fund))
    return data ? { title: data.scheme.name, description: `${data.scheme.name}: its NAV and returns against other ${data.scheme.category.toLowerCase()} funds, and what a monthly SIP in it became.` } : {}
  }
  const inst = listedFund(fund)
  if (!inst) return {}
  return {
    title: `${inst.name} (${inst.symbol})`,
    description:
      inst.kind === "ETF"
        ? `${inst.name}: live price, the year's return${inst.underlying ? ` against ${inst.underlying}` : ""} and the other ETFs that follow it.`
        : `${inst.name}: live price and the year's return of this listed ${KIND_NAMES[inst.kind]}.`,
  }
}

/** The year's return, from the fund's static row or, for an index it follows, the universe or demo history. */
function yearReturn(inst: Instrument, row: FundStatic | undefined, yearAgoOf: (id: number) => number | null, price: (id: number) => number): number | null {
  const yearAgo = row?.yearAgo ?? yearAgoOf(inst.id)
  return yearAgo ? (price(inst.id) / yearAgo - 1) * 100 : null
}

export default async function FundPage({ params }: PageProps<"/funds/[fund]">) {
  const { fund } = await params
  if (isSchemeCode(fund)) return <MutualFundPage code={Number(fund)} />
  const inst = listedFund(fund)
  if (!inst) notFound()
  const [universe, feed] = await Promise.all([getUniverse(), getFeed()])
  const statics = listedFundStatics(universe)
  const mine = statics.find((s) => s.id === inst.id)
  const target = inst.tracks != null ? getInstrument(inst.tracks) : undefined
  const rows = new Map(universe?.instruments.map((r) => [r.id, r]))
  const yearAgoOf = (id: number) => {
    if (universe) return rows.get(id)?.yearAgo ?? null
    const inst = getInstrument(id)
    return inst ? dailyCandles(inst, 251)[0]!.close : null
  }
  // The last close the server knows; the chart and figures below go live in the browser.
  const price = (id: number) => feed.quotes?.find((q) => q.id === id)?.ltp ?? getInstrument(id)?.prevClose ?? 0
  const own = yearReturn(inst, mine, yearAgoOf, price)
  const theirs = target ? yearReturn(target, undefined, yearAgoOf, price) : null
  const high = Math.max(mine?.high52 ?? 0, price(inst.id))
  const fromHigh = high ? (price(inst.id) / high - 1) * 100 : 0
  const peers = inst.kind === "ETF" && inst.underlying ? ETFS.filter((e) => e.underlying === inst.underlying) : []
  // An ETF can be tested like the index it follows. A REIT's or InvIT's return is mostly its payouts, which the lab's price-only tests leave out.
  const testable = inst.kind === "ETF"

  const real = feed.dataset === "real"
  const trust = inst.kind === "REIT" ? "Owns offices, malls or warehouses, and pays out most of the rent." : "Owns roads, power lines or pipelines, and pays out most of what they earn."

  return (
    <div className="page pt-6 pb-10">
      <InstrumentHeader
        inst={inst}
        crumbs={[{ href: "/funds", label: "Funds" }, inst.kind === "ETF" ? { href: "/funds?view=etfs", label: "ETFs" } : { href: "/funds?view=trusts", label: "REITs and InvITs" }]}
        tags={
          <>
            <Tag>{inst.symbol}</Tag>
            <Tag>{KIND_NAMES[inst.kind]}</Tag>
            {inst.category && <Tag>{inst.category}</Tag>}
          </>
        }
        test={testable}
      />
      {inst.kind !== "ETF" && <p className="mt-3 text-[13px] text-ink-3">{trust}</p>}
      {testable && <StickySummary instrumentId={inst.id} />}

      <Figures className="mt-5 sm:grid-cols-4 lg:grid-cols-4" aria-label="The year in figures">
        <Figure label="A year" value={formatPct(own, 1)} tone={toneOf(own)} hint={inst.kind === "ETF" ? "To the last close" : "In price, before payouts"} />
        {inst.kind === "ETF" && target && theirs != null && (
          <Figure label={target.name} value={formatPct(theirs, 1)} tone={toneOf(theirs)} delta={<Tag tone="bench">Its index</Tag>} hint="A year, to the last close" />
        )}
        {inst.kind === "ETF" && own != null && theirs != null && <Figure label="Tracking gap" value={`${formatSigned(own - theirs, 1)} pts`} hint="Its costs and how closely it tracks" />}
        <Figure label="From 52-week high" value={fromHigh > -1 ? "At the high" : formatPct(fromHigh, 1)} />
      </Figures>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <Panel aria-label={`${inst.name} price`} className="lg:col-span-8 2xl:col-span-9">
          <PricePanel id={inst.id} />
        </Panel>
        <Section title="Key figures" size="rail" className="lg:col-span-4 2xl:col-span-3">
          <KeyStats id={inst.id} stats={{ beta: inst.beta }} />
        </Section>
        {peers.length > 1 && (
          <Section
            className="lg:col-span-12"
            title={`ETFs that follow ${inst.underlying}`}
            description="Most traded first. Funds that follow the same thing differ mainly in cost, how closely they track and how easily they trade."
          >
            <ListedTable kind="etf" funds={peers} data={statics} query="" category="all" />
          </Section>
        )}
        {testable && <TestIt className="lg:col-span-12" inst={inst} history={real ? "the last five years of its daily prices" : "five years of the demo market's prices"} />}
      </div>
    </div>
  )
}
