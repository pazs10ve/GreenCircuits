import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { About } from "@/components/company/about"
import { InstrumentHeader } from "@/components/company/instrument-header"
import { KeyStats } from "@/components/company/key-stats"
import { Constituents } from "@/components/company/constituents"
import { Financials } from "@/components/company/financials"
import { FiveNumbers } from "@/components/company/five-numbers"
import { Ownership } from "@/components/company/ownership"
import { Peers } from "@/components/company/peers"
import { PricePanel } from "@/components/company/price-panel"
import { StickySummary } from "@/components/company/sticky-summary"
import { ExperimentCard } from "@/components/editorial/experiment-card"
import { PageTabs, type PageTab } from "@/components/editorial/page-tabs"
import { Panel } from "@/components/editorial/panel"
import { Section } from "@/components/editorial/section"
import { TestIdeaMenu } from "@/components/lab/test-idea-menu"
import { TestIt } from "@/components/lab/test-it"
import { ScoreDots } from "@/components/parts/score-dots"
import { Tag } from "@/components/parts/tag"
import { ComingUp } from "@/components/today/coming-up"
import { EQUITIES, getInstrumentBySlug, hrefOf, isListedFund, membersOf } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"
import { balancedMix, sipVsDip, type Experiment } from "@greencircuits/market/research/experiments"
import { getCompany } from "@/lib/data/company"
import { getFeed, liveGet } from "@/lib/data/market"
import { getUniverse } from "@/lib/data/universe"

export async function generateMetadata({ params }: PageProps<"/stocks/[symbol]">): Promise<Metadata> {
  const { symbol } = await params
  const inst = getInstrumentBySlug(symbol)
  if (!inst) return {}
  return {
    title: inst.kind === "EQUITY" ? `${inst.name} (${inst.symbol})` : inst.name,
    description: `${inst.name}: price history, valuation against its own past, financials, ownership and investing ideas tested on it.`,
  }
}

export default async function InstrumentPage({ params, searchParams }: PageProps<"/stocks/[symbol]">) {
  const [{ symbol }, { tab }] = await Promise.all([params, searchParams])
  const inst = getInstrumentBySlug(symbol)
  if (!inst) notFound()
  if (inst.kind === "COMMODITY" || isListedFund(inst)) redirect(hrefOf(inst))
  const view = typeof tab === "string" ? tab : undefined
  return inst.kind === "EQUITY" ? <Company inst={inst} tab={view} /> : <Market inst={inst} tab={view} />
}

/** The pre-run tests on the page's subject in full, then the lab's other questions put to it: the Tests tab. */
function Tests({ inst, experiments, history, description }: { inst: Instrument; experiments: Experiment[]; history: string; description: string }) {
  return (
    <div className="space-y-5">
      {experiments.length > 0 && (
        <Section id="ideas" kicker="From the lab" brand title="Would it have worked?" description={description}>
          <div className="grid gap-4 lg:grid-cols-2">
            {experiments.map((e) => (
              <ExperimentCard key={e.id} experiment={e} />
            ))}
          </div>
        </Section>
      )}
      <TestIt inst={inst} history={history} />
    </div>
  )
}

async function Company({ inst, tab }: { inst: Instrument; tab?: string }) {
  const [{ profile, experiments, peers, events }, { dataset }, universe] = await Promise.all([getCompany(inst), getFeed(), getUniverse()])
  const real = dataset === "real"
  const mcapCr = peers.find((p) => p.id === inst.id)?.mcapCr
  const history = real ? "the last five years of its daily prices" : "five years of the demo market's prices"

  const overview = (
    <div className="grid gap-5 lg:grid-cols-12">
      <Panel aria-label={`${inst.name} price`} className="lg:col-span-8">
        <PricePanel id={inst.id} />
      </Panel>
      <Section title="Key figures" size="rail" className="lg:col-span-4">
        <KeyStats
          id={inst.id}
          stats={{
            mcapCr,
            pe: profile.pe?.current ?? profile.f.pe,
            pb: profile.f.pb,
            divYield: profile.f.dividendYield,
            roe: profile.f.roe,
            beta: universe?.instruments.find((r) => r.id === inst.id)?.beta ?? inst.beta,
          }}
        />
      </Section>
      <Section
        className="lg:col-span-12"
        title="Scorecard"
        description={`Five measures of the business. Valuation is judged against the company's own history; profitability against its sector. ${real ? "From the company's results, via Yahoo Finance." : "Sample figures."}`}
        action={<ScoreDots tones={profile.pillars.map((p) => p.tone)} size={10} />}
      >
        <FiveNumbers profile={profile} />
      </Section>
      {experiments.length > 0 && (
        <Section
          className={events.length > 0 ? "lg:col-span-8" : "lg:col-span-12"}
          kicker="From the lab"
          brand
          title="Would it have worked?"
          description={`Two ways of buying ${inst.name}, tested on ${history}.`}
          action={<TestIdeaMenu instrumentId={inst.id} size="sm" />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {experiments.map((e) => (
              <ExperimentCard key={e.id} experiment={e} compact />
            ))}
          </div>
        </Section>
      )}
      {events.length > 0 && (
        <Section title="Coming up" size="rail" className={experiments.length > 0 ? "lg:col-span-4" : "lg:col-span-12"}>
          <ComingUp events={events} linked={false} />
        </Section>
      )}
      {profile.f.about && (
        <Section className="lg:col-span-12" title="What it does">
          <About inst={inst} about={profile.f.about} website={profile.f.website} mcapCr={mcapCr} />
        </Section>
      )}
    </div>
  )

  const tabs: PageTab[] = [
    { id: "overview", label: "Overview", content: overview },
    {
      id: "financials",
      label: "Financials",
      content: (
        <Section title="Financials" hint="₹ crore · years to March">
          <Financials f={profile.f} />
        </Section>
      ),
    },
    {
      id: "ownership",
      label: "Ownership",
      content: (
        <Section title="Who owns it" hint="At the end of each quarter">
          <Ownership history={profile.f.shareholding} name={inst.name} />
        </Section>
      ),
    },
    {
      id: "peers",
      label: "Peers",
      content: (
        <Section
          title="Against its peers"
          description={`The largest ${inst.sector?.toLowerCase()} companies ${real ? `among the ${EQUITIES.length} this site follows` : "in the demo universe"}.`}
        >
          <Peers rows={peers} currentId={inst.id} />
        </Section>
      ),
    },
    {
      id: "tests",
      label: "Tests",
      content: <Tests inst={inst} experiments={experiments} history={history} description={`Two ways of buying ${inst.name}, tested on ${history}.`} />,
    },
  ]

  return (
    <div className="page pt-6 pb-10">
      <InstrumentHeader
        inst={inst}
        tags={
          <>
            <Tag>{inst.symbol}</Tag>
            {inst.industry && <Tag>{inst.industry}</Tag>}
          </>
        }
      >
        <TestIdeaMenu instrumentId={inst.id} />
      </InstrumentHeader>
      <StickySummary instrumentId={inst.id} />
      <PageTabs key={inst.id} tabs={tabs} initial={tab} label={`About ${inst.name}`} />
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

/** An index or currency: from the API when the backend runs, else the demo generators. */
async function marketView(inst: Instrument) {
  const [overview, feed] = await Promise.all([liveGet<Overview>(`/v1/market/overview/${inst.slug}`, { revalidate: 60 }), getFeed()])
  if (overview) {
    return {
      closed: feed.closed,
      real: feed.dataset === "real",
      members: overview.members,
      // A few indices have no history on Yahoo, only the days since real data was first loaded.
      since: overview.sessions < 200 ? overview.since : null,
      experiments: overview.experiments,
    }
  }
  const members = membersOf(inst.id).map((m) => m.id)
  return {
    closed: null,
    real: false,
    members,
    since: null,
    experiments: inst.kind === "INDEX" && members.length > 0 ? [sipVsDip(inst, { years: 10 }), balancedMix(inst)] : [],
  }
}

async function Market({ inst, tab }: { inst: Instrument; tab?: string }) {
  const { closed, real, members, since, experiments } = await marketView(inst)
  const index = inst.kind === "INDEX"
  const tracked = members.length >= MIN_MEMBERS
  const history = real ? "the last ten years of its daily closes" : "ten years of the demo market's prices"

  const overview = (
    <div className="grid gap-5 lg:grid-cols-12">
      <Panel aria-label={`${inst.name} level`} className="lg:col-span-8">
        <PricePanel id={inst.id} defaultRange="1D" />
      </Panel>
      <Section title="Key figures" size="rail" className="lg:col-span-4">
        <KeyStats id={inst.id} stats={{ members: tracked ? members.length : undefined, memberIds: tracked ? members : undefined }} />
      </Section>
      {tracked && (
        <Section
          className="lg:col-span-12"
          title={closed ? "What moved it" : "What's moving it today"}
          description={`Members ranked by the points they ${closed ? `added to or took off the index ${closed}` : "are adding to or taking off the index"}${real ? `, weighted by market value among the ${members.length} this site follows` : ""}.`}
        >
          <Constituents indexId={inst.id} members={members} />
        </Section>
      )}
    </div>
  )

  const tabs: PageTab[] = [{ id: "overview", label: "Overview", content: overview }]
  if (index && members.length > 0) {
    tabs.push({
      id: "tests",
      label: "Tests",
      content: <Tests inst={inst} experiments={experiments} history={history} description={`Tested on ${history}.`} />,
    })
  }

  return (
    <div className="page pt-6 pb-10">
      <InstrumentHeader
        inst={inst}
        tags={
          <>
            <Tag>{index ? "Index" : "Currency"}</Tag>
            <Tag>{inst.exchange}</Tag>
            {tracked && <Tag>{members.length} companies</Tag>}
          </>
        }
      >
        {index && <TestIdeaMenu instrumentId={inst.id} />}
      </InstrumentHeader>
      {index && <StickySummary instrumentId={inst.id} />}
      {since && (
        <p className="mt-3 text-[13px] text-ink-3">
          Prices from {longDate(since)} only: Yahoo Finance keeps no daily history for this index, so each close is added as it comes.
        </p>
      )}
      <PageTabs key={inst.id} tabs={tabs} initial={tab} label={`About ${inst.name}`} />
    </div>
  )
}
