import Link from "next/link"
import type { Route } from "next"
import { CalendarOff, Clock, Coins, FileText, Rocket, type LucideIcon } from "lucide-react"
import { getInstrument, hrefOf as instrumentHref } from "@greencircuits/market/catalog"
import type { MarketEvent } from "@greencircuits/market/reference"
import { Tag } from "@/components/parts/tag"

function hrefOf(e: MarketEvent): string | undefined {
  const inst = e.instrumentId ? getInstrument(e.instrumentId) : undefined
  if (inst) return instrumentHref(inst)
  if (e.kind === "IPO") return "/ipos"
  return undefined
}

/** One word and an icon per kind of event, in ink: the calendar is information, not an alarm. */
const KIND: Record<MarketEvent["kind"], { label: string; icon: LucideIcon }> = {
  RESULTS: { label: "Results", icon: FileText },
  DIVIDEND: { label: "Dividend", icon: Coins },
  EXPIRY: { label: "Expiry", icon: Clock },
  IPO: { label: "IPO", icon: Rocket },
  HOLIDAY: { label: "Holiday", icon: CalendarOff },
}

const ist = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...opts })
const DAY = ist({ day: "numeric" })
const MONTH = ist({ month: "short" })

/** What's ahead: results, dividends, expiries and IPOs, each with its date on a tile and its kind as a tag. */
export function ComingUp({ events, limit, linked = true }: { events: MarketEvent[]; limit?: number; linked?: boolean }) {
  const shown = limit ? events.slice(0, limit) : events
  return (
    <ol className="-my-2 divide-y divide-rule">
      {shown.map((e, i) => {
        // A company's own page lists its own events: no link back to where the reader is.
        const href = linked ? hrefOf(e) : undefined
        const kind = KIND[e.kind]
        const title = <span className="block truncate text-sm font-medium">{e.title}</span>
        return (
          <li key={`${e.title}-${i}`} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 py-2">
            <span className="rounded-panel bg-panel py-1.5 text-center leading-none">
              <span className="figure block text-[1.125rem]">{DAY.format(e.date)}</span>
              <span className="mt-0.5 block text-[11px] text-ink-3">{MONTH.format(e.date)}</span>
            </span>
            <span className="min-w-0">
              {href ? (
                <Link href={href as Route} className="decoration-rule-strong underline-offset-4 hover:underline">
                  {title}
                </Link>
              ) : (
                title
              )}
              {e.detail && <span className="block truncate text-xs text-ink-3">{e.detail}</span>}
            </span>
            <Tag icon={kind.icon}>{kind.label}</Tag>
          </li>
        )
      })}
    </ol>
  )
}
