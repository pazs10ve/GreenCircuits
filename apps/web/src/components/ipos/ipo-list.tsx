import { CalendarClock, Clock, Zap } from "lucide-react"
import { formatNumber } from "@greencircuits/market/format"
import { Figure } from "@/components/editorial/figures"
import { Section } from "@/components/editorial/section"
import { Monogram } from "@/components/parts/monogram"
import { Move } from "@/components/parts/move"
import { Tag } from "@/components/parts/tag"
import type { IpoView } from "@/lib/data/ipos"
import { cn } from "@/lib/utils"

const DAY = 86_400_000
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`)
const daysFrom = (today: string, date: string) => Math.round((toMs(date) - toMs(today)) / DAY)

/** "today", "tomorrow", "on Wednesday" within a week, else "on 6 October". */
export function dayWords(date: string, today: string): string {
  const days = daysFrom(today, date)
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  if (days === -1) return "yesterday"
  const format = days > 1 && days < 7 ? { weekday: "long" as const } : { day: "numeric" as const, month: "long" as const }
  return `on ${new Intl.DateTimeFormat("en-IN", { ...format, timeZone: "UTC" }).format(toMs(date))}`
}

/** "tomorrow", "Wednesday", "6 October": the same without its "on", after a verb. */
const dayAfterVerb = (date: string, today: string) => dayWords(date, today).replace(/^on /, "")

const longDate = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", timeZone: "UTC" }).format(toMs(date))
const shortDate = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(toMs(date))

/** "24–26 Sept", or "30 Sept–2 Oct" across a month's end. */
function span(from: string, to: string) {
  return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))}–${shortDate(to)}` : `${shortDate(from)}–${shortDate(to)}`
}
const rupees = (v: number) => `₹${formatNumber(v, v % 1 ? 2 : 0)}`
const times = (v: number) => `${formatNumber(v, v >= 10 ? 1 : 2)}×`

// ------------------------------------------------------------------ the next two weeks

/** The next ten weekdays from today: the days an issue can open, close, allot or list. */
function weekdays(today: string, n = 10): string[] {
  const out: string[] = []
  for (let t = toMs(today); out.length < n; t += DAY) {
    const d = new Date(t)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/**
 * Every issue in the next two weeks on one calendar: when bids are taken,
 * when shares are allotted, and when they list.
 */
export function IpoTimeline({ ipos, today }: { ipos: IpoView[]; today: string }) {
  const days = weekdays(today)
  const [first, last] = [days[0]!, days.at(-1)!]
  // A date's column; a weekend date falls in the weekday after it. Null off the calendar.
  const col = (date: string | undefined) => {
    if (!date || date < first || date > last) return null
    return days.findIndex((d) => d >= date)
  }
  const lanes = ipos
    .filter((x) => x.status !== "LISTED")
    .flatMap((x) => {
      const bidding = x.close >= first && x.open <= last ? { from: col(x.open < first ? first : x.open)!, to: col(x.close > last ? last : x.close)! } : null
      const allot = col(x.allotment)
      const list = col(x.listing)
      return bidding || allot != null || list != null ? [{ ipo: x, bidding, allot, list }] : []
    })
    .sort((a, b) => a.ipo.open.localeCompare(b.ipo.open))
  if (lanes.length === 0) return null
  const grid = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }
  const label = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(toMs(d))

  return (
    <Section title="The next two weeks" description="Bidding runs from an issue's opening day to its close; shares are allotted a working day later and list about two days after that.">
      <div className="scrollbar-thin overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)] gap-4 pb-2.5">
            <span />
            <div className="grid" style={grid}>
              {days.map((d) => (
                <span key={d} className={cn("text-center text-xs", d === today ? "font-bold text-ink" : "text-ink-3")}>
                  {label(d)}
                </span>
              ))}
            </div>
          </div>
          <ul>
            {lanes.map(({ ipo, bidding, allot, list }) => (
              <li key={ipo.id} className="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)] items-center gap-4 border-t border-rule py-2">
                <span className="truncate text-sm font-semibold">{ipo.name}</span>
                <div className="grid h-7 items-center" style={grid}>
                  {bidding && (
                    <span
                      className={cn(
                        "flex h-6 items-center overflow-hidden rounded-[8px] px-2.5 text-xs font-semibold whitespace-nowrap",
                        ipo.status === "OPEN" ? "bg-attn-soft text-attn" : "bg-surface-2 text-ink-2",
                      )}
                      style={{ gridRow: 1, gridColumn: `${bidding.from + 1} / ${bidding.to + 2}` }}
                    >
                      {bidding.to > bidding.from ? "Bidding" : ""}
                    </span>
                  )}
                  {allot != null && (
                    <span
                      className="size-3 justify-self-center rounded-full border-2 border-ink"
                      style={{ gridRow: 1, gridColumn: allot + 1 }}
                      title={`Allotment ${longDate(ipo.allotment!)}`}
                    />
                  )}
                  {list != null && (
                    <span
                      className="flex size-[22px] items-center justify-center justify-self-center rounded-full bg-ink text-paper"
                      style={{ gridRow: 1, gridColumn: list + 1 }}
                      title={`Lists ${longDate(ipo.listing!)}`}
                    >
                      <Zap className="size-3" aria-hidden="true" />
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-[4px] bg-attn-soft" aria-hidden="true" />
          Open now
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-[4px] bg-surface-2" aria-hidden="true" />
          Opening soon
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-ink" aria-hidden="true" />
          Allotment
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-ink" aria-hidden="true" />
          Listing
        </span>
      </div>
    </Section>
  )
}

// ------------------------------------------------------------------ an issue

function StatusTag({ ipo, today }: { ipo: IpoView; today: string }) {
  if (ipo.status === "OPEN") {
    const d = daysFrom(today, ipo.close)
    return (
      <Tag tone="attn" icon={Clock}>
        {d <= 0 ? "Closes today" : d === 1 ? "Closes tomorrow" : `Closes in ${d} days`}
      </Tag>
    )
  }
  if (ipo.status === "UPCOMING") return <Tag icon={CalendarClock}>Opens {dayAfterVerb(ipo.open, today)}</Tag>
  return <Tag icon={CalendarClock}>{ipo.listing ? `Lists ${dayAfterVerb(ipo.listing, today)}` : "Being allotted"}</Tag>
}

/** Demand so far, by category, against the line where an issue is fully subscribed. */
function Subscription({ ipo }: { ipo: IpoView }) {
  if (ipo.status === "UPCOMING" || ipo.total == null || ipo.total === 0) {
    return <p className="text-xs text-ink-3">{ipo.status === "UPCOMING" ? "Not open for bids yet." : ipo.total === 0 ? "No bids counted yet." : "No subscription figures yet."}</p>
  }
  const rows = [...ipo.categories, { label: "Overall", times: ipo.total }]
  const max = Math.max(1.25, ...rows.map((r) => r.times))
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-ink-2">Subscribed</span>
        <span className="inline-flex items-center gap-1.5 text-ink-3">
          <span className="h-3 w-0.5 rounded-full bg-bench" aria-hidden="true" />
          Fully subscribed
        </span>
      </div>
      <ul className="space-y-2" aria-label="Times subscribed, by category">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.25rem] items-center gap-2.5 text-[13px]">
            <span className={cn("truncate", r.label === "Overall" ? "font-semibold text-ink" : "text-ink-2")}>{r.label}</span>
            <span className="relative h-2 rounded-full bg-surface-2" aria-hidden="true">
              <span className={cn("absolute inset-y-0 left-0 rounded-full", r.label === "Overall" ? "bg-ink" : "bg-ink-3")} style={{ width: `${Math.min(1, r.times / max) * 100}%` }} />
              <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-bench" style={{ left: `${(1 / max) * 100}%` }} />
            </span>
            <span className="num text-right font-semibold">{times(r.times)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Details({ ipo }: { ipo: IpoView }) {
  const rows: [string, string][] = []
  if (ipo.allotment) rows.push(["Allotment", longDate(ipo.allotment)])
  if (ipo.listing) rows.push(["Listing", longDate(ipo.listing)])
  if (ipo.sizeCr) rows.push(["Raising", `₹${formatNumber(ipo.sizeCr, 0)} crore${ipo.freshCr ? `, ₹${formatNumber(ipo.freshCr, 0)} crore of it new money` : ", all from shareholders selling"}`])
  if (ipo.registrar) rows.push(["Registrar", ipo.registrar])
  if (ipo.leadManagers?.length) rows.push(["Lead managers", ipo.leadManagers.join(", ")])
  if (!ipo.about && rows.length === 0) return null
  return (
    <details className="group border-t border-rule pt-3 text-[13px]">
      <summary className="cursor-pointer list-none text-xs font-semibold text-ink-2 hover:text-ink">About the issue</summary>
      <div className="mt-2.5 space-y-2.5">
        {ipo.about && <p className="leading-relaxed text-ink-2">{ipo.about}</p>}
        {rows.length > 0 && (
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-3">{k}</dt>
                <dd className="text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </details>
  )
}

/** One issue as a card: who, when, the price and the smallest bid, and how much demand there is. */
export function IpoCard({ ipo, today }: { ipo: IpoView; today: string }) {
  const fixed = ipo.priceHigh != null && (ipo.priceLow == null || ipo.priceLow === ipo.priceHigh)
  const band = ipo.priceHigh == null ? "–" : fixed ? rupees(ipo.priceHigh) : `₹${formatNumber(ipo.priceLow!, ipo.priceLow! % 1 ? 2 : 0)}–${formatNumber(ipo.priceHigh, ipo.priceHigh % 1 ? 2 : 0)}`
  const lotValue = ipo.lot && ipo.priceHigh ? ipo.lot * ipo.priceHigh : null
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-card border border-rule bg-paper p-4 sm:p-5" aria-label={ipo.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-[1.1875rem] leading-snug font-semibold">{ipo.name}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ipo.sector && <Tag>{ipo.sector}</Tag>}
            <Tag>{ipo.board === "SME" ? "SME" : "Main board"}</Tag>
          </div>
        </div>
        <StatusTag ipo={ipo} today={today} />
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <Figure variant="panel" size="sm" label={fixed ? "Fixed price" : "Price band"} value={band} />
        {lotValue != null ? (
          <Figure variant="panel" size="sm" label="Smallest bid" value={rupees(lotValue)} hint={`${formatNumber(ipo.lot!, 0)} shares`} />
        ) : ipo.sizeCr ? (
          <Figure variant="panel" size="sm" label="Raising" value={`₹${formatNumber(ipo.sizeCr, 0)} Cr`} />
        ) : (
          <Figure variant="panel" size="sm" label="Bidding" value={span(ipo.open, ipo.close)} />
        )}
      </dl>
      <Subscription ipo={ipo} />
      <div className="mt-auto">
        <Details ipo={ipo} />
      </div>
    </article>
  )
}

// ------------------------------------------------------------------ listed

/** Issues that have listed: how they did on the first day and since, against the issue price. */
export function ListedList({ ipos, today }: { ipos: IpoView[]; today: string }) {
  const cols = "grid grid-cols-[1.875rem_minmax(0,1fr)_4.5rem_4.5rem] items-center gap-3 sm:grid-cols-[1.875rem_minmax(0,1fr)_6rem_5.5rem_5.5rem]"
  return (
    <div>
      <div className={cn(cols, "border-b border-rule pb-2 text-xs font-medium text-ink-3")}>
        <span />
        <span />
        <span className="hidden text-right sm:block">Issue price</span>
        <span className="text-right">First day</span>
        <span className="text-right">Since</span>
      </div>
      <ul className="divide-y divide-rule">
        {ipos.map((x) => {
          const first = x.listingPrice && x.priceHigh ? (x.listingPrice / x.priceHigh - 1) * 100 : null
          const since = x.lastPrice && x.priceHigh ? (x.lastPrice / x.priceHigh - 1) * 100 : null
          return (
            <li key={x.id} className={cn(cols, "py-2.5")}>
              <Monogram text={x.name} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{x.name}</span>
                <span className="block truncate text-xs text-ink-3">
                  {x.sector ? `${x.sector} · ` : ""}
                  {x.listing ? `Listed ${dayWords(x.listing, today)}` : "Listed"}
                </span>
              </span>
              <span className="num hidden text-right text-[13px] text-ink-2 sm:block">{x.priceHigh ? rupees(x.priceHigh) : "–"}</span>
              <span className="text-right">
                <Move value={first} digits={1} />
              </span>
              <span className="text-right">
                <Move value={since} digits={1} />
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
