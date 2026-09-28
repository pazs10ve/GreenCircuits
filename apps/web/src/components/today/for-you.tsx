"use client"

import { useState } from "react"
import Link from "next/link"
import type { FeedItem, FeedKind } from "@greencircuits/feed/feed"
import { Tag, type TagTone } from "@/components/parts/tag"
import { Skeleton } from "@/components/ui/skeleton"
import { useFeed } from "@/lib/feed/client"
import { MoreLink } from "@/components/editorial/section"
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

/** The tag's tone: a rise or a fall in green or red, an alert in amber, a test in the lab's green. */
function toneOf(item: FeedItem): TagTone {
  if (item.kind === "alert") return "attn"
  if (item.kind === "test" || item.kind === "signal") return "brand"
  return item.tone === "up" ? "up" : item.tone === "down" ? "down" : "neutral"
}

function Row({ item, compact }: { item: FeedItem; compact: boolean }) {
  const body = (
    <div className={cn("grid gap-x-4 gap-y-1", compact ? "py-2.5" : "py-3.5 sm:grid-cols-[8.5rem_minmax(0,1fr)]")}>
      <span>
        <Tag tone={toneOf(item)}>{LABEL[item.kind]}</Tag>
      </span>
      <span className="min-w-0">
        <span className={cn("block text-sm leading-snug font-medium decoration-rule-strong underline-offset-4 group-hover:underline", compact ? "line-clamp-2" : "")}>{item.title}</span>
        {item.detail && <span className="mt-0.5 block truncate text-xs text-ink-3">{item.detail}</span>}
      </span>
    </div>
  )
  return (
    <li>
      {item.href ? (
        <Link href={item.href} className="group block outline-none focus-visible:bg-panel">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  )
}

/** The personalised feed: what matters today about the stocks you follow. `compact` for a side rail. */
export function ForYou({ compact = false }: { compact?: boolean }) {
  const { data, isPending } = useFeed()
  const [all, setAll] = useState(false)
  const SHOWN = compact ? 4 : 6

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
      <div className={cn("text-ink-2", compact ? "text-sm" : "text-[0.9375rem]")}>
        <p>Follow a few stocks, and what matters about them shows up here.</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/watchlists" className="link">
            Make a watchlist
          </Link>
          <Link href="/alerts" className="link">
            Set an alert
          </Link>
          <Link href="/lab" className="link">
            Test an idea
          </Link>
        </p>
      </div>
    )
  }
  if (!data.items.length) {
    return <p className="text-[0.9375rem] text-ink-2">Nothing unusual about the {data.following} stocks you follow.</p>
  }
  const shown = all ? data.items : data.items.slice(0, SHOWN)
  return (
    <div>
      <ol className="-my-2.5 divide-y divide-rule">
        {shown.map((item) => (
          <Row key={item.id} item={item} compact={compact} />
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
    <MoreLink href="/account#feed">Tune</MoreLink>
  )
}
