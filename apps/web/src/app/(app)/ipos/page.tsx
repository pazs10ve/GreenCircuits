import type { Metadata } from "next"
import { formatNumber } from "@greencircuits/market/format"
import { Section } from "@/components/editorial/section"
import { PageHead } from "@/components/editorial/page-head"
import { IpoList, dayWords } from "@/components/ipos/ipo-list"
import { SectionNav } from "@/components/shell/section-nav"
import { getIpoCalendar, type IpoStatus, type IpoView } from "@/lib/data/ipos"
import { getFeed } from "@/lib/data/market"

export const metadata: Metadata = {
  title: "IPOs",
  description: "Indian IPOs open for bids, opening soon, waiting to list and recently listed, with price bands, dates and demand.",
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]
const count = (n: number) => WORDS[n] ?? String(n)
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The standfirst: what's open, what's hot, what's next and how the last listing went. */
function lede(ipos: IpoView[], today: string): string {
  const open = ipos.filter((x) => x.status === "OPEN")
  const closing = open.filter((x) => x.close === today).length
  const parts: string[] = []
  if (open.length) {
    const when =
      closing === 0 ? "" : closing === open.length ? (open.length === 1 ? ", and it closes today" : ", and all of them close today") : `, and ${count(closing)} ${closing === 1 ? "closes" : "close"} today`
    parts.push(`${capital(count(open.length))} ${open.length === 1 ? "IPO is" : "IPOs are"} open for bids${when}.`)
    const hot = open.filter((x) => x.total != null).sort((a, b) => b.total! - a.total!)[0]
    if (hot && hot.total! >= 1) parts.push(`${hot.name} is the most sought after so far, bid for ${formatNumber(hot.total!, 1)} times over.`)
  } else {
    parts.push("No IPO is open for bids right now.")
  }
  const next = ipos.filter((x) => x.status === "UPCOMING").sort((a, b) => a.open.localeCompare(b.open))[0]
  if (next) parts.push(`${next.name} opens ${dayWords(next.open, today)}.`)
  const listed = ipos.filter((x) => x.status === "LISTED" && x.listingPrice && x.priceHigh).sort((a, b) => (b.listing ?? "").localeCompare(a.listing ?? ""))[0]
  if (listed) {
    const gain = (listed.listingPrice! / listed.priceHigh! - 1) * 100
    parts.push(`${listed.name} listed ${dayWords(listed.listing!, today)}, ${formatNumber(Math.abs(gain), 0)}% ${gain >= 0 ? "above" : "below"} its issue price.`)
  }
  return parts.join(" ")
}

const SECTIONS: { status: IpoStatus; title: string; description: string; order: (a: IpoView, b: IpoView) => number }[] = [
  { status: "OPEN", title: "Open for bids", description: "Closing soonest first.", order: (a, b) => a.close.localeCompare(b.close) || (b.total ?? 0) - (a.total ?? 0) },
  { status: "UPCOMING", title: "Opening soon", description: "In the order they open.", order: (a, b) => a.open.localeCompare(b.open) },
  { status: "CLOSED", title: "Waiting to list", description: "Bidding is over; shares are being allotted.", order: (a, b) => a.close.localeCompare(b.close) },
  { status: "LISTED", title: "Recently listed", description: "How they did against the issue price.", order: (a, b) => (b.listing ?? "").localeCompare(a.listing ?? "") },
]

export default async function IposPage() {
  const { today, dataset } = await getFeed()
  const { ipos, source } = await getIpoCalendar(today)
  const real = source === "api" && dataset === "real"

  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-6 pb-20">
      <SectionNav section="explore" />
      <PageHead title="IPOs" serif lede={lede(ipos, today)} />

      <div className="mt-14 space-y-16">
        {SECTIONS.map((s) => {
          const list = ipos.filter((x) => x.status === s.status).sort(s.order)
          if (list.length === 0) return null
          return (
            <Section key={s.status} title={s.title} description={s.description}>
              <IpoList ipos={list} today={today} />
            </Section>
          )
        })}

        <Section title="How an IPO works here">
          <div className="grid max-w-5xl gap-x-12 gap-y-6 text-[0.9375rem] leading-relaxed text-ink-2 md:grid-cols-3">
            <p>
              <span className="font-semibold text-ink">A price band and a lot.</span> Most main-board issues are book-built: you bid at a price within the band, in lots
              sized so that one lot costs around ₹15,000. SME issues usually have one fixed price and much bigger lots.
            </p>
            <p>
              <span className="font-semibold text-ink">Shares by category.</span> Half of a main-board issue is kept for institutions, 15% for wealthy individuals and
              35% for retail investors. When retail is bid for many times over, allotment is by lottery, one lot each to the winners.
            </p>
            <p>
              <span className="font-semibold text-ink">Three days to list.</span> Bidding stays open for at least three working days. Shares are allotted the next
              working day, money blocked for bids that missed is freed the day after, and the shares list on the third working day after the issue closes.
            </p>
          </div>
        </Section>

        <p className="text-sm text-ink-3">
          {real
            ? "From NSE's lists of current and upcoming issues, as of the last data load. NSE doesn't publish lot or issue sizes there, so they aren't shown."
            : "Sample IPOs: the companies are made up, and the mechanics are real."}
        </p>
      </div>
    </div>
  )
}
