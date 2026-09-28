import type { Metadata } from "next"
import Link from "next/link"
import { cookies } from "next/headers"
import { FlaskConical } from "lucide-react"
import { ExperimentCard } from "@/components/editorial/experiment-card"
import { MoreLink, Section } from "@/components/editorial/section"
import { HeatScale } from "@/components/parts/heat-scale"
import { ComingUp } from "@/components/today/coming-up"
import { ForYou, ForYouAction } from "@/components/today/for-you"
import { MarketHero } from "@/components/today/market-hero"
import { MarketsList } from "@/components/today/markets-list"
import { PortfolioToday } from "@/components/today/portfolio-today"
import { SectorsToday } from "@/components/today/sectors-today"
import { Welcome } from "@/components/today/welcome"
import { WELCOME_COOKIE } from "@/components/today/welcome-cookie"
import { WhatMoved } from "@/components/today/what-moved"
import { Button } from "@/components/ui/button"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import { screenerSnapshot, type ScreenRow } from "@greencircuits/market/fundamentals"
import { dailyCandles } from "@greencircuits/market/history"
import { getFeed, getTodayContext, liveGet } from "@/lib/data/market"
import { getUniverse } from "@/lib/data/universe"

export const metadata: Metadata = {
  title: { absolute: "Today · GreenCircuits" },
}

/** The instruments in the markets card, whose month the page draws. */
const LISTED = [INDEX.SENSEX, INDEX.BANKNIFTY, INDEX.NIFTYIT, INDEX.MIDCAP150, INDEX.SMALLCAP250, 400, 300]

/**
 * The front page as a dashboard: the Nifty's day and the whole market's
 * breadth beside the other markets; the biggest moves beside the sectors;
 * the reader's own feed, portfolio and calendar; and three of the lab's
 * findings to finish.
 */
export default async function TodayPage() {
  const [{ ranges, results, events, experiments }, { dataset }, universe, jar, screen] = await Promise.all([
    getTodayContext(),
    getFeed(),
    getUniverse(),
    cookies(),
    liveGet<{ rows: ScreenRow[] }>("/v1/screener/rows", { revalidate: 60 }),
  ])
  // The Nifty 50's members from the API; the components fall back to the demo universe's without them.
  const members = universe?.members[INDEX.NIFTY]
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date())
  const sparkOf = new Map(universe?.instruments.map((r) => [r.id, r.spark]))
  const sparks = Object.fromEntries(
    LISTED.map((id) => {
      const inst = getInstrument(id)
      return [id, sparkOf.get(id) ?? (inst ? dailyCandles(inst, 30).map((c) => c.close) : [])]
    }),
  )
  const sma200 = (screen?.rows.length ? screen.rows : screenerSnapshot()).flatMap((r): [number, number][] => (r.sma200 != null ? [[r.id, r.sma200]] : []))

  return (
    <div className="page pt-1 pb-10">
      {!jar.has(WELCOME_COOKIE) && <Welcome />}
      <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-12">
        <section aria-label="The day's market" className="min-w-0 rounded-card border border-rule bg-paper p-4 sm:p-5 md:col-span-2 lg:col-span-8">
          <MarketHero date={date} sma200={sma200} />
        </section>
        <Section className="md:col-span-2 lg:col-span-4" title="Markets" action={<MoreLink href="/markets">Overview</MoreLink>}>
          <MarketsList sparks={sparks} />
        </Section>

        <Section
          id="moved"
          className="md:col-span-2 lg:col-span-8"
          title="Biggest moves"
          hint="Against each stock's usual day"
          description="The Nifty 500's most unusual moves: each against how much the stock normally moves in a day, so a 3% day for a steady company counts for more than one for a volatile one."
        >
          <WhatMoved ranges={ranges} results={results} members={members} />
        </Section>
        <Section
          className="md:col-span-2 lg:col-span-4"
          title="Sectors"
          description="Every company's move, weighted by its size, gathered into its sector. Pick one to see its companies."
          action={<HeatScale />}
        >
          <SectorsToday />
        </Section>

        <Section id="for-you" className="lg:col-span-4" title="For you" action={<ForYouAction />}>
          <ForYou compact />
        </Section>
        <Section className="lg:col-span-4" title="Your portfolio" action={<MoreLink href="/portfolio">Holdings</MoreLink>}>
          <PortfolioToday />
        </Section>
        <Section className="md:col-span-2 lg:col-span-4" title="Coming up" action={<MoreLink href="/ipos">IPOs</MoreLink>}>
          <ComingUp events={events} limit={5} />
        </Section>

        <Section
          className="md:col-span-2 lg:col-span-12"
          kicker="From the lab"
          brand
          title="Would it have worked?"
          description={`Three ideas investors argue about, settled on ${dataset === "real" ? "the Nifty 50's last ten years" : "ten years of the demo market's prices"}, with the charges an Indian investor pays.`}
          action={
            <Button asChild variant="brand" size="sm">
              <Link href="/lab/new">
                <FlaskConical /> Test your own idea
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-3">
            {experiments.map((e) => (
              <ExperimentCard key={e.id} experiment={e} compact />
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
