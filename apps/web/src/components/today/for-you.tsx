"use client"

import { useState } from "react"
import Link from "next/link"
import type { FeedItem, FeedKind } from "@greencircuits/feed/feed"
import { Skeleton } from "@/components/ui/skeleton"
import { useFeed } from "@/lib/feed/client"
import { cn } from "@/lib/utils"

const LABEL: Record<FeedKind, string> = {
  portfolio: "Your holdings",
  alert: "Alert",
  signal: "Your rules",
  move: "Moving",
  high: "52-week high",
  low: "52-week low",
  event: "Coming up",
  test: "Your test",
  sector: "Your sectors",
}

const SHOWN = 6

function Row({ item }: { item: FeedItem }) {
  const body = (
    <div className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <span className={cn("pt-0.5 text-[13px] font-medium", item.tone === "up" ? "text-up" : item.tone === "down" ? "text-down" : "text-ink-3")}>{LABEL[item.kind]}</span>
      <span className="min-w-0">
        <span className="block font-serif text-[1.0625rem] leading-snug text-ink decoration-1 underline-offset-4 group-hover:underline">{item.title}</span>
        {item.detail && <span className="mt-1 block text-sm leading-relaxed text-ink-2">{item.detail}</span>}
      </span>
    </div>
  )
  return (
    <li>
      {item.href ? (
        <Link href={item.href} className="group block outline-none focus-visible:bg-surface">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  )
}

/** The personalised feed: what matters today about the stocks you follow. */
export function ForYou() {
  const { data, isPending } = useFeed()
  const [all, setAll] = useState(false)

  if (isPending || !data) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }
  if (!data.following && !data.items.length) {
    return (
      <p className="max-w-[40em] text-[0.9375rem] leading-relaxed text-ink-2">
        Your feed fills up as you follow stocks. Add some to a{" "}
        <Link href="/watchlists" className="link">
          watchlist
        </Link>
        , set an alert, or{" "}
        <Link href="/lab" className="link">
          test an idea in the lab
        </Link>
        , and this is where you&apos;ll hear what moved, what&apos;s coming up and what your rules would do.
      </p>
    )
  }
  if (!data.items.length) {
    return <p className="text-[0.9375rem] text-ink-2">Nothing unusual about the {data.following} stocks you follow.</p>
  }
  const shown = all ? data.items : data.items.slice(0, SHOWN)
  return (
    <div>
      <ol className="divide-y divide-rule border-y border-rule">
        {shown.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </ol>
      {data.items.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="link mt-3 text-sm font-medium">
          {all ? "Show fewer" : `Show all ${data.items.length}`}
        </button>
      )}
    </div>
  )
}

/** The section's action: tuning the feed, or keeping it on every device. */
export function ForYouAction() {
  return (
    <Link href="/account#feed" className="link inline-flex items-center gap-1 text-sm font-medium">
      Tune your feed <span aria-hidden="true">→</span>
    </Link>
  )
}
