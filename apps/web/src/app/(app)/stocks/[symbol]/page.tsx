import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { BellPlus } from "lucide-react"
import { CompanyLede } from "@/components/company/company-lede"
import { Constituents } from "@/components/company/constituents"
import { Financials } from "@/components/company/financials"
import { FiveNumbers } from "@/components/company/five-numbers"
import { Ownership } from "@/components/company/ownership"
import { Peers } from "@/components/company/peers"
import { PricePanel } from "@/components/company/price-panel"
import { ExperimentCard } from "@/components/editorial/experiment-card"
import { Section } from "@/components/editorial/section"
import { AlertDialogButton } from "@/components/market/alert-dialog"
import { WatchButton } from "@/components/market/watch-button"
import { ComingUp } from "@/components/today/coming-up"
import { Button } from "@/components/ui/button"
import { EQUITIES, getInstrumentBySlug, membersOf } from "@greencircuits/market/catalog"
import { fiftyTwoWeek } from "@greencircuits/market/history"
import type { Instrument } from "@greencircuits/market/types"
import { formatNumber } from "@greencircuits/market/format"
import { balancedMix, sipVsDip, type Experiment } from "@greencircuits/market/research/experiments"
import { marketSeed, openingQuotes } from "@greencircuits/market/session"
import { apiGet } from "@/lib/data/api"
import { getCompany } from "@/lib/data/company"
import { getFeed } from "@/lib/data/market"

export async function generateMetadata({ params }: PageProps<"/stocks/[symbol]">): Promise<Metadata> {
  const { symbol } = await params
  const inst = getInstrumentBySlug(symbol)
  if (!inst) return {}
  return {
    title: inst.kind === "EQUITY" ? `${inst.name} (${inst.symbol})` : inst.name,
    description: `${inst.name}: price history, valuation against its own past, financials, ownership and investing ideas tested on it.`,
  }
}

export default async function InstrumentPage({ params }: PageProps<"/stocks/[symbol]">) {
  const { symbol } = await params
  const inst = getInstrumentBySlug(symbol)
  if (!inst) notFound()
  if (inst.kind === "COMMODITY") redirect(`/commodities?c=${inst.slug}`)
  return inst.kind === "EQUITY" ? <Company inst={inst} /> : <Market inst={inst} />
}

function Header({ inst, meta, children }: { inst: Instrument; meta: React.ReactNode; children?: React.ReactNode }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-[13px] text-ink-3">
        <Link href="/stocks" className="hover:text-ink">
          Explore
        </Link>
        {inst.sector && (
          <>
            <span className="mx-1.5" aria-hidden="true">
              /
            </span>
            <Link href={`/stocks?sector=${inst.sector.toLowerCase()}`} className="hover:text-ink">
              {inst.sector}
            </Link>
          </>
        )}
      </nav>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
        <div className="min-w-0">
          <h1 className="font-serif text-[2.375rem] leading-[1.04] font-semibold tracking-[-0.02em] md:text-[3.25rem]">{inst.name}</h1>
          <p className="mt-2 text-sm text-ink-2">{meta}</p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <WatchButton instrumentId={inst.id} size="default" />
          <AlertDialogButton
            instrumentId={inst.id}
            trigger={
              <Button variant="outline">
                <BellPlus /> Set an alert
              </Button>
            }
          />
          {children}
        </div>
      </header>
    </>
  )
}

async function Company({ inst }: { inst: Instrument }) {
  const [{ profile, high52, experiments, peers, events }, { dataset }] = await Promise.all([getCompany(inst), getFeed()])
  const real = dataset === "real"

  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-8">
      <Header inst={inst} meta={`${inst.symbol} · NSE · ${inst.industry}`}>
        <Button asChild>
          <a href="#ideas">Test an idea</a>
        </Button>
      </Header>
      <CompanyLede id={inst.id} high52={high52} pe={profile.pe} growth={profile.f.profitCagr3y} />

      <div className="mt-10">
        <PricePanel id={inst.id} />
      </div>

      <div className="mt-20 space-y-20">
        <Section
          title="The business in five numbers"
          description={`Valuation is judged against the company's own history; profitability against its sector. ${real ? "From the company's results, via Yahoo Finance." : "Sample figures."}`}
        >
          <FiveNumbers profile={profile} />
        </Section>

        <Section
          id="ideas"
          title="Would it have worked?"
          description={`Two ways of buying ${inst.name}, tested on ${real ? "the last five years of its prices" : "five years of the demo market's prices"}.`}
        >
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-12">
            {experiments.map((e) => (
              <ExperimentCard key={e.id} experiment={e} />
            ))}
          </div>
        </Section>

        <Section title="Financials" description="In ₹ crore. The financial year ends in March.">
          <Financials f={profile.f} />
        </Section>

        <Section title="Who owns it" description="Shareholding at the end of each quarter.">
          <Ownership history={profile.f.shareholding} name={inst.name} />
        </Section>

        <Section
          title="Compared with its peers"
          description={`The largest ${inst.sector?.toLowerCase()} companies ${real ? `among the ${EQUITIES.length} this site follows` : "in the demo universe"}.`}
        >
          <Peers rows={peers} currentId={inst.id} />
        </Section>

        {events.length > 0 && (
          <Section title="Coming up">
            <ComingUp events={events} />
          </Section>
        )}
      </div>
    </div>
  )
}

/** GET /v1/market/overview/:slug */
interface Overview {
  close: number
  high52: number
  low52: number
  sessions: number
  since: string
  members: number[]
  experiments: Experiment[]
}

/** Fewer members than this among the site's stocks, and "what's moving it" would mislead. */
const MIN_MEMBERS = 5

const longDate = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))

/** An index, currency or commodity: from the API when the backend runs, else the demo generators. */
async function marketView(inst: Instrument) {
  const [overview, feed] = await Promise.all([apiGet<Overview>(`/v1/market/overview/${inst.slug}`, { revalidate: 60 }), getFeed()])
  if (overview) {
    return {
      closed: feed.closed,
      real: feed.dataset === "real",
      members: overview.members,
      high: overview.high52,
      low: overview.low52,
      price: feed.quotes?.find((q) => q.id === inst.id)?.ltp ?? overview.close,
      // A few indices have no history on Yahoo, only the days since real data was first loaded.
      since: overview.sessions < 200 ? overview.since : null,
      experiments: overview.experiments,
    }
  }
  const members = membersOf(inst.id).map((m) => m.id)
  const { high, low } = fiftyTwoWeek(inst)
  return {
    closed: null,
    real: false,
    members,
    high,
    low,
    price: openingQuotes(marketSeed()).get(inst.id)?.ltp ?? inst.prevClose,
    since: null,
    experiments: inst.kind === "INDEX" && members.length > 0 ? [sipVsDip(inst, { years: 10 }), balancedMix(inst)] : [],
  }
}

async function Market({ inst }: { inst: Instrument }) {
  const { closed, real, members, high, low, price, since, experiments } = await marketView(inst)
  const tracked = members.length >= MIN_MEMBERS
  const fromHigh = (price / Math.max(high, price) - 1) * 100
  const memberNote = tracked
    ? real
      ? ` ${members.length} of its companies are among the ${EQUITIES.length} this site follows.`
      : ` It tracks ${members.length} companies in this demo universe, weighted by size.`
    : ""
  const lede = since
    ? `This site has prices for ${inst.name} only from ${longDate(since)}: Yahoo Finance keeps no daily history for it, so each close is added as it comes.${memberNote}`
    : inst.kind === "INDEX"
      ? `${inst.name} is ${fromHigh > -1 ? "at its 52-week high" : `${formatNumber(Math.abs(fromHigh), 1)}% below its 52-week high`}, and ${formatNumber(((price / low) - 1) * 100, 0)}% above its 52-week low.${memberNote}`
      : `${inst.name} is ${formatNumber(Math.abs(fromHigh), 1)}% ${fromHigh >= 0 ? "above" : "below"} its 52-week high.`

  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-8">
      <Header inst={inst} meta={inst.kind === "INDEX" ? `Index · ${inst.exchange}` : `Currency · ${inst.exchange}`} />
      <p className="mt-6 max-w-[40em] font-serif text-[1.1875rem] leading-relaxed text-ink-2 md:text-[1.3125rem]">{lede}</p>
      <div className="mt-10">
        <PricePanel id={inst.id} defaultRange="1D" />
      </div>
      <div className="mt-20 space-y-20">
        {tracked && (
          <Section
            title={closed ? "What moved it" : "What's moving it today"}
            description={`Members ranked by the points they ${closed ? `added to or took off the index ${closed}` : "are adding to or taking off the index"}${real ? `, weighted by market value among the ${members.length} this site follows` : ""}.`}
          >
            <Constituents indexId={inst.id} members={members} />
          </Section>
        )}
        {experiments.length > 0 && (
          <Section id="ideas" title="Would it have worked?" description={real ? "Tested on the last ten years of its daily closes." : "Tested on ten years of the demo market's prices."}>
            <div className="grid gap-14 lg:grid-cols-2 lg:gap-12">
              {experiments.map((e) => (
                <ExperimentCard key={e.id} experiment={e} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}
