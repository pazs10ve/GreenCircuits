import Link from "next/link"
import { getInstrument } from "@greencircuits/market/catalog"
import type { MarketEvent } from "@greencircuits/market/reference"

const KIND: Record<MarketEvent["kind"], string> = {
  RESULTS: "Results",
  EXPIRY: "Expiry",
  IPO: "IPO",
  DIVIDEND: "Dividend",
  HOLIDAY: "Holiday",
}

function hrefOf(e: MarketEvent): string | undefined {
  if (e.instrumentId) return `/stocks/${getInstrument(e.instrumentId)?.slug}`
  if (e.kind === "IPO") return "/ipos"
  return undefined
}

/** A dated list of what's ahead: results, dividends, expiries and IPOs. */
export function ComingUp({ events }: { events: MarketEvent[] }) {
  const fmt = (opts: Intl.DateTimeFormatOptions, d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...opts }).format(d)
  return (
    <ol className="divide-y divide-rule">
      {events.map((e, i) => {
        const href = hrefOf(e)
        const body = (
          <>
            <span className="w-12 shrink-0 text-center">
              <span className="figure block text-[1.375rem] leading-none">{fmt({ day: "numeric" }, e.date)}</span>
              <span className="block text-xs text-ink-3">{fmt({ month: "short" }, e.date)}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem]">{e.title}</span>
              <span className="block text-[13px] text-ink-3">
                {fmt({ weekday: "long" }, e.date)} · {e.detail}
              </span>
            </span>
            <span className="shrink-0 text-xs text-ink-3">{KIND[e.kind]}</span>
          </>
        )
        return (
          <li key={`${e.title}-${i}`}>
            {href ? (
              <Link href={href} className="flex items-center gap-4 py-3 hover:bg-surface/60">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-4 py-3">{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
