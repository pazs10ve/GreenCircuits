import { formatNumber, formatPct } from "@greencircuits/market/format"
import type { IpoView } from "@/lib/data/ipos"
import { cn } from "@/lib/utils"

const DAY = 86_400_000

/** "today", "tomorrow", "on Wednesday" within a week, else "on 6 October". */
export function dayWords(date: string, today: string): string {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY)
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  if (days === -1) return "yesterday"
  const format = days > 1 && days < 7 ? { weekday: "long" as const } : { day: "numeric" as const, month: "long" as const }
  return `on ${new Intl.DateTimeFormat("en-IN", { ...format, timeZone: "UTC" }).format(Date.parse(`${date}T00:00:00Z`))}`
}

const longDate = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", timeZone: "UTC" }).format(Date.parse(`${date}T00:00:00Z`))
const rupees = (v: number) => `₹${formatNumber(v, v % 1 ? 2 : 0)}`
const times = (v: number) => `${formatNumber(v, v >= 10 ? 1 : 2)}×`

function priceWords(x: IpoView): string {
  if (x.priceHigh == null) return "No price in the list yet."
  if (x.priceLow == null || x.priceLow === x.priceHigh) return `A fixed price of ${rupees(x.priceHigh)} a share.`
  return `${rupees(x.priceLow)} to ${rupees(x.priceHigh)} a share.`
}

function dateWords(x: IpoView, today: string): string {
  switch (x.status) {
    case "OPEN":
      return x.close === today ? "Bids close today." : `Bids close ${dayWords(x.close, today)}.`
    case "UPCOMING":
      return `Opens ${dayWords(x.open, today)} and closes ${dayWords(x.close, today)}.`
    case "CLOSED":
      return x.listing
        ? `Bidding closed ${dayWords(x.close, today)}; the shares list ${dayWords(x.listing, today)}.`
        : `Bidding closed ${dayWords(x.close, today)}.`
    case "LISTED":
      return x.listing ? `Listed ${dayWords(x.listing, today)}.` : "Listed."
  }
}

function sizeWords(x: IpoView): string | null {
  if (!x.sizeCr) return null
  const fresh = x.freshCr ?? 0
  if (fresh > 0 && x.ofsCr) return `Raising ₹${formatNumber(x.sizeCr, 0)} crore, ₹${formatNumber(fresh, 0)} crore of it new money; the rest goes to shareholders selling out.`
  if (fresh > 0) return `Raising ₹${formatNumber(x.sizeCr, 0)} crore, all of it new money.`
  return `Raising ₹${formatNumber(x.sizeCr, 0)} crore, all from shareholders selling out.`
}

function Demand({ ipo }: { ipo: IpoView }) {
  if (ipo.status === "LISTED" && ipo.listingPrice && ipo.priceHigh) {
    const gain = (ipo.listingPrice / ipo.priceHigh - 1) * 100
    const now = ipo.lastPrice ? (ipo.lastPrice / ipo.priceHigh - 1) * 100 : null
    return (
      <div>
        <p className={cn("figure text-[1.75rem] leading-none", gain >= 0 ? "text-up" : "text-down")}>{formatPct(gain, 1)}</p>
        <p className="mt-1.5 text-sm text-ink-2">on its first day{now != null && `, ${formatPct(now, 1)} since`}</p>
      </div>
    )
  }
  if (ipo.status === "UPCOMING" || ipo.total == null || ipo.total === 0) {
    return (
      <p className="text-sm text-ink-3">
        {ipo.status === "UPCOMING" ? "Not open for bids yet." : ipo.total === 0 ? "No bids counted yet." : "No subscription figures yet."}
      </p>
    )
  }
  const max = Math.max(1, ...ipo.categories.map((c) => c.times))
  return (
    <div>
      <p className="figure text-[1.75rem] leading-none">{times(ipo.total)}</p>
      <p className="mt-1.5 text-sm text-ink-2">{ipo.status === "OPEN" ? "bid for so far" : "bid for in all"}</p>
      {ipo.categories.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Times subscribed, by category">
          {ipo.categories.map((c) => (
            <li key={c.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.25rem] items-center gap-2 text-[13px]">
              <span className="truncate text-ink-3">{c.label}</span>
              <span className="h-1 rounded-full bg-surface-2" aria-hidden="true">
                <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(1, c.times / max) * 100}%` }} />
              </span>
              <span className="num text-right text-ink-2">{times(c.times)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Details({ ipo }: { ipo: IpoView }) {
  const rows: [string, string][] = []
  if (ipo.allotment) rows.push(["Allotment", longDate(ipo.allotment)])
  if (ipo.registrar) rows.push(["Registrar", ipo.registrar])
  if (ipo.leadManagers?.length) rows.push(["Lead managers", ipo.leadManagers.join(", ")])
  if (!ipo.about && rows.length === 0) return null
  return (
    <details className="group mt-3 text-sm md:col-span-3">
      <summary className="cursor-pointer list-none text-ink-3 hover:text-ink-2">
        <span className="underline decoration-dotted underline-offset-2">About the issue</span>
      </summary>
      <div className="mt-3 grid max-w-3xl gap-x-10 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {ipo.about && <p className="leading-relaxed text-ink-2">{ipo.about}</p>}
        {rows.length > 0 && (
          <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5">
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

/** One IPO per row: who, the price and dates in plain sentences, and how much demand there is. */
export function IpoList({ ipos, today }: { ipos: IpoView[]; today: string }) {
  return (
    <ol className="divide-y divide-rule border-y border-rule">
      {ipos.map((x) => {
        const lotValue = x.lot && x.priceHigh ? x.lot * x.priceHigh : null
        return (
          <li key={x.id} className="grid gap-x-10 gap-y-3 py-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,14rem)]">
            <div className="min-w-0">
              <h3 className="font-serif text-[1.1875rem] leading-snug font-semibold">{x.name}</h3>
              <p className="mt-0.5 text-[13px] text-ink-3">
                {x.board === "SME" ? "SME platform" : "Main board"}
                {x.sector && ` · ${x.sector}`}
              </p>
            </div>
            <p className="text-[0.9375rem] leading-relaxed text-ink-2">
              {priceWords(x)} {dateWords(x, today)}
              {lotValue != null && ` Bids come in lots of ${formatNumber(x.lot!, 0)} shares, ${rupees(lotValue)} a lot at the top of the band.`}
              {sizeWords(x) && ` ${sizeWords(x)}`}
            </p>
            <Demand ipo={x} />
            <Details ipo={x} />
          </li>
        )
      })}
    </ol>
  )
}
