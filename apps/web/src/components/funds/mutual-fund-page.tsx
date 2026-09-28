import Link from "next/link"
import { notFound } from "next/navigation"
import { getInstrument, slugify } from "@greencircuits/market/catalog"
import { DEMO_SESSIONS, benchmarkOf } from "@greencircuits/market/funds"
import { dailyCandles } from "@greencircuits/market/history"
import type { Candle, Point } from "@greencircuits/market/types"
import { formatNumber } from "@greencircuits/market/format"
import { Panel } from "@/components/editorial/panel"
import { Section } from "@/components/editorial/section"
import { Monogram } from "@/components/parts/monogram"
import { Tag } from "@/components/parts/tag"
import { benchmarkReturns, getFundCategories, getScheme, getSchemes } from "@/lib/data/funds"
import { liveGet } from "@/lib/data/market"
import { CATEGORY_NOTES } from "./categories"
import { FundStanding } from "./fund-standing"
import { NavChart } from "./nav-chart"
import { PERIODS, median, returnsOf } from "./returns"
import { ReturnBars } from "./return-bars"
import { SchemeTable } from "./scheme-table"
import { SipCalculator } from "./sip-calculator"

const longDate = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))

/** The index's closes, to set the fund against: from the API, else the demo's history. */
async function benchmarkPoints(id: number): Promise<Point[]> {
  const inst = getInstrument(id)!
  const api = await liveGet<{ candles: Candle[] }>(`/v1/instruments/${id}/candles?sessions=2600`, { revalidate: 300 })
  const candles = api?.candles.length ? api.candles : dailyCandles(inst, DEMO_SESSIONS)
  return candles.map((c) => ({ time: c.time, value: c.close }))
}

/** One mutual fund scheme: how it did, against its category and its index, and what a SIP in it became. */
export async function MutualFundPage({ code }: { code: number }) {
  const data = await getScheme(code)
  if (!data) notFound()
  const { scheme, history } = data
  const indexId = benchmarkOf(scheme.category)
  const [{ source }, peers, benchmark, points] = await Promise.all([
    getFundCategories(),
    getSchemes(scheme.category),
    benchmarkReturns(scheme.category),
    indexId != null ? benchmarkPoints(indexId) : Promise.resolve(null),
  ])
  const real = source === "api"
  // A span the fund hasn't lived through is left off: its category's figure alone says nothing about it.
  const groups = PERIODS.filter((p) => scheme[p.key] != null).map((p) => ({
    label: p.label,
    own: scheme[p.key],
    typical: median(returnsOf(peers, p.key)),
    index: benchmark?.returns[p.key] ?? null,
  }))

  return (
    <div className="page pt-6 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-[13px] text-ink-3">
            <Link href="/funds" className="hover:text-ink">
              Funds
            </Link>
            <span className="mx-1.5" aria-hidden="true">
              /
            </span>
            <Link href={`/funds?category=${slugify(scheme.category)}`} className="hover:text-ink">
              {scheme.category}
            </Link>
          </nav>
          <div className="mt-2 flex items-center gap-3.5">
            <Monogram text={scheme.amc} size={48} />
            <div className="min-w-0">
              <h1 className="font-serif text-[1.625rem] leading-[1.1] font-semibold tracking-[-0.02em] text-balance md:text-[1.875rem]">{scheme.name}</h1>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Tag>{scheme.category}</Tag>
                <Tag>Direct · Growth</Tag>
                <Tag>{scheme.amc.replace(/ Mutual Fund$/, "")}</Tag>
              </div>
            </div>
          </div>
        </div>
        {scheme.nav != null && (
          <div className="text-right">
            <span className="figure text-[1.75rem] leading-none md:text-[2.125rem]">
              <span className="mr-0.5 text-[0.6em] text-ink-3">₹</span>
              {formatNumber(scheme.nav, 2)}
            </span>
            {scheme.navDate && <p className="mt-1.5 text-[13px] text-ink-3">NAV on {longDate(scheme.navDate)}</p>}
          </div>
        )}
      </header>
      {CATEGORY_NOTES[scheme.category] && <p className="mt-3 text-[13px] text-ink-3">{CATEGORY_NOTES[scheme.category]}</p>}

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <Panel aria-label="What ₹10,000 became" className="lg:col-span-8 2xl:col-span-9">
          <NavChart history={history} benchmark={benchmark && points ? { name: benchmark.name, points } : null} />
        </Panel>
        <Section
          title="In its category"
          size="rail"
          description={`Against every ${real ? "direct growth plan" : "fund in the demo's sample"} of the category: the worst on the left, the best on the right, the tick the typical fund.`}
          className="lg:col-span-4 2xl:col-span-3"
        >
          <FundStanding scheme={scheme} peers={peers} />
        </Section>
        {groups.length > 0 && (
          <Section title="Returns" hint="% a year" description="On the NAV, to its latest date; beyond a year, a year's return, compounded. An index's level leaves out the dividends a fund collects." className="lg:col-span-5">
            <ReturnBars groups={groups} indexName={benchmark?.name ?? null} />
          </Section>
        )}
        <Section title="A monthly SIP in it" description="Bought on the first day each month the fund published a NAV, and valued at the latest." className={groups.length > 0 ? "lg:col-span-7" : "lg:col-span-12"}>
          <SipCalculator history={history} />
        </Section>
        <Section title={`Other ${scheme.category.toLowerCase()} funds`} description={real ? "Every direct growth plan in the category." : "The demo's sample of the category."} className="lg:col-span-12">
          <SchemeTable schemes={peers} />
        </Section>
      </div>
      <p className="mt-6 text-xs text-ink-3">
        {real ? "NAVs from AMFI, and their history from mfapi.in." : "The scheme is real; in the demo its NAV history is simulated from the demo market, ending at its latest real NAV."} Past returns don&apos;t predict
        future ones. Not investment advice.
      </p>
    </div>
  )
}
