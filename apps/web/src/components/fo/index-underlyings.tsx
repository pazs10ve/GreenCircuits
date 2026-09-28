"use client"

import Link from "next/link"
import { expiriesFor } from "@greencircuits/market/chain"
import type { Instrument } from "@greencircuits/market/types"
import { formatCompact, formatNumber } from "@greencircuits/market/format"
import { LivePrice } from "@/components/market/price"
import { LiveMove } from "@/components/parts/live-move"
import { Tag } from "@/components/parts/tag"
import { Skeleton } from "@/components/ui/skeleton"
import { useNow } from "@/hooks/use-now"
import { useQuote } from "@/lib/stream/hooks"
import { cn } from "@/lib/utils"
import { FO_UNDERLYINGS, formatExpiry } from "./chain-model"

const DAY = 86_400_000

/** Whole days from today to an expiry, on the calendar rather than the clock. */
export function daysTo(expiry: Date, now: Date) {
  return Math.round((Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY)
}

/** "Today", "Tomorrow", "In 4 days": close ones in amber, since they want watching. */
export function ExpiryTag({ expiry, now }: { expiry: Date; now: Date }) {
  const days = daysTo(expiry, now)
  return (
    <Tag tone={days <= 1 ? "attn" : "neutral"} className="num">
      {days <= 0 ? "Expires today" : days === 1 ? "Tomorrow" : `${formatExpiry(expiry)} · ${days} days`}
    </Tag>
  )
}

function Card({ inst, now }: { inst: Instrument; now: Date | null }) {
  const q = useQuote(inst.id)
  const expiry = now ? expiriesFor(inst, now, 1)[0] : undefined
  const lot = inst.lot ?? 1
  return (
    <Link href={`/fo/${inst.slug}`} className="group flex min-w-0 flex-col gap-2 rounded-card border border-rule bg-paper p-4 transition-colors hover:border-rule-strong">
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-xs text-ink-3 group-hover:text-ink-2">{inst.name}</span>
        <LiveMove id={inst.id} />
      </span>
      <LivePrice id={inst.id} className="figure text-[1.5rem] leading-none" />
      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {expiry && now ? <ExpiryTag expiry={expiry} now={now} /> : <Skeleton className="h-4 w-24" />}
      </span>
      <span className="text-xs text-ink-3">
        Lots of {formatNumber(lot, 0)}
        {q ? ` · ₹${formatCompact(q.ltp * lot, 1)} a lot` : ""}
      </span>
    </Link>
  )
}

/** The indices with options, a card each: the level, the next expiry and what a lot is worth. */
export function IndexUnderlyings() {
  // Expiries depend on the date, so they wait for the browser's clock.
  const now = useNow(60_000)
  const indices = FO_UNDERLYINGS.filter((i) => i.kind === "INDEX")
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4", indices.length <= 4 ? "lg:grid-cols-4" : "lg:grid-cols-5")}>
      {indices.map((inst) => (
        <Card key={inst.id} inst={inst} now={now} />
      ))}
    </div>
  )
}
