import type { Metadata } from "next"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { IpoCard, IpoTimeline, ListedList } from "@/components/ipos/ipo-list"
import { RAMP, ShareBar } from "@/components/parts/share-bar"
import { Tag } from "@/components/parts/tag"
import { getIpoCalendar, type IpoStatus, type IpoView } from "@/lib/data/ipos"
import { getFeed } from "@/lib/data/market"

export const metadata: Metadata = {
  title: "IPOs",
  description: "Indian IPOs open for bids, opening soon, waiting to list and recently listed, with price bands, dates and demand.",
}

const GROUPS: { status: IpoStatus; title: string; order: (a: IpoView, b: IpoView) => number }[] = [
  { status: "OPEN", title: "Open for bids", order: (a, b) => a.close.localeCompare(b.close) || (b.total ?? 0) - (a.total ?? 0) },
  { status: "UPCOMING", title: "Opening soon", order: (a, b) => a.open.localeCompare(b.open) },
  { status: "CLOSED", title: "Waiting to list", order: (a, b) => a.close.localeCompare(b.close) },
]

/** How a main-board issue is shared out. */
const QUOTA = [
  { label: "Institutions", share: 50 },
  { label: "Wealthy individuals", share: 15 },
  { label: "Retail", share: 35 },
]

export default async function IposPage() {
  const { today, dataset } = await getFeed()
  const { ipos, source } = await getIpoCalendar(today)
  const real = source === "api" && dataset === "real"
  const count = (status: IpoStatus) => ipos.filter((x) => x.status === status).length
  const counts = [
    [count("OPEN"), "open"],
    [count("UPCOMING"), "opening soon"],
    [count("CLOSED"), "waiting to list"],
  ].flatMap(([n, words]) => (n ? [`${n} ${words}`] : []))
  const lede = [...(counts.length ? counts : ["Nothing open or coming up"]), "subscription as the bids come in"].join(" · ")
  const listed = ipos.filter((x) => x.status === "LISTED").sort((a, b) => (b.listing ?? "").localeCompare(a.listing ?? ""))

  return (
    <div className="page pt-6 pb-10">
      <PageHead title="IPOs" lede={lede} />

      <div className="mt-5 space-y-5">
        <IpoTimeline ipos={ipos} today={today} />

        {GROUPS.map((g) => {
          const list = ipos.filter((x) => x.status === g.status).sort(g.order)
          if (list.length === 0) return null
          return (
            <section key={g.status} aria-labelledby={`ipos-${g.status}`}>
              <h2 id={`ipos-${g.status}`} className="mb-3 flex items-center gap-2 text-sm font-semibold">
                {g.title}
                <Tag className="num">{list.length}</Tag>
              </h2>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {list.map((x) => (
                  <IpoCard key={x.id} ipo={x} today={today} />
                ))}
              </div>
            </section>
          )
        })}

        {listed.length > 0 && (
          <Section title="Recently listed" description="Against the issue price: the first day's close, and the price since.">
            <ListedList ipos={listed} today={today} />
          </Section>
        )}

        <Section title="How an IPO works">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-panel bg-panel p-4">
              <p className="text-sm font-semibold">Bid within a band</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                Main-board issues are book-built: you bid at a price in the band, in lots of about ₹15,000. SME issues have one price and much bigger lots.
              </p>
            </div>
            <div className="rounded-panel bg-panel p-4">
              <p className="text-sm font-semibold">Shares by category</p>
              <ShareBar className="mt-3" parts={QUOTA.map((q, i) => ({ value: q.share, className: RAMP[i * 2]! }))} label="Half for institutions, 15% for wealthy individuals, 35% for retail" />
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
                {QUOTA.map((q, i) => (
                  <li key={q.label} className="inline-flex items-center gap-1.5">
                    <span className={`size-2 rounded-[2px] ${RAMP[i * 2]}`} aria-hidden="true" />
                    {q.label} {q.share}%
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">When retail is bid for many times over, a lottery gives one lot each to the winners.</p>
            </div>
            <div className="rounded-panel bg-panel p-4">
              <p className="text-sm font-semibold">Three days to list</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                Bids stay open at least three working days. Shares are allotted the next working day and list on the third working day after the close.
              </p>
            </div>
          </div>
        </Section>

        <p className="text-xs text-ink-3">
          {real
            ? "From NSE's lists of current and upcoming issues, as of the last data load. NSE doesn't publish lot or issue sizes there, so they aren't shown."
            : "Sample IPOs: the companies are made up, and the mechanics are real."}
        </p>
      </div>
    </div>
  )
}
