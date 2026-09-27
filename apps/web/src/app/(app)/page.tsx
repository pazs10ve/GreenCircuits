import type { Metadata } from "next"
import { ExperimentCard } from "@/components/editorial/experiment-card"
import { MoreLink, Section } from "@/components/editorial/section"
import { ComingUp } from "@/components/today/coming-up"
import { IndexToday } from "@/components/today/index-today"
import { MarketLede } from "@/components/today/market-lede"
import { MarketsList } from "@/components/today/markets-list"
import { PortfolioToday } from "@/components/today/portfolio-today"
import { SectorsToday } from "@/components/today/sectors-today"
import { WhatMoved } from "@/components/today/what-moved"
import { INDEX } from "@greencircuits/market/catalog"
import { getTodayContext } from "@/lib/data/market"

export const metadata: Metadata = {
  title: { absolute: "Today · GreenCircuits" },
}

export default async function TodayPage() {
  const { ranges, results, events, experiments } = await getTodayContext()
  const date = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date())

  return (
    <div className="mx-auto max-w-[1200px] px-5">
      <div className="grid gap-12 pt-8 pb-16 md:pt-12 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16">
        <div className="min-w-0">
          <p className="mb-4 text-[13px] text-ink-2">{date}</p>
          <MarketLede />
          <IndexToday id={INDEX.NIFTY} className="mt-10" />
        </div>
        <aside className="lg:pt-9">
          <MarketsList />
        </aside>
      </div>

      <div className="space-y-20">
        <Section title="Your portfolio today" action={<MoreLink href="/portfolio">Open portfolio</MoreLink>}>
          <PortfolioToday />
        </Section>

        <Section title="What moved" description="The day's most unusual moves, measured against how much each stock normally moves.">
          <WhatMoved ranges={ranges} results={results} />
        </Section>

        <Section
          id="ideas"
          title="Would it have worked?"
          description="Three common investing ideas, tested on ten years of the demo market's daily prices."
          action={<MoreLink href="/lab">Open the lab</MoreLink>}
        >
          <div className="grid gap-14 lg:grid-cols-3 lg:gap-10">
            {experiments.map((e) => (
              <ExperimentCard key={e.id} experiment={e} />
            ))}
          </div>
        </Section>

        <div className="grid gap-20 lg:grid-cols-2 lg:gap-12">
          <Section title="Sectors today" description="Nifty 50 members, weighted by size.">
            <SectorsToday />
          </Section>
          <Section title="Coming up">
            <ComingUp events={events} />
          </Section>
        </div>
      </div>
    </div>
  )
}
