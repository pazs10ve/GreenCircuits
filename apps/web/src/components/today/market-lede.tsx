"use client"

import { useMemo } from "react"
import { marketStory } from "@greencircuits/market/research/market-story"
import { useQuoteReader, useSession } from "@/lib/stream/hooks"

/**
 * The day's headline and standfirst, rewritten from the quotes every few
 * seconds, in the past tense once the session is over. `members` are the
 * Nifty 50's, from the API; the demo universe's without them.
 */
export function MarketLede({ members }: { members?: number[] }) {
  const read = useQuoteReader(8000)
  const { closed } = useSession()
  const story = useMemo(() => marketStory(read, { members, closed }), [read, members, closed])
  if (!story) return null
  return (
    <div>
      <h1 className="font-serif text-[2.125rem] leading-[1.06] font-semibold tracking-[-0.02em] md:text-[2.875rem]">{story.headline}</h1>
      <p className="mt-4 max-w-[36em] font-serif text-[1.125rem] leading-relaxed text-ink-2 md:text-[1.25rem]">{story.standfirst}</p>
    </div>
  )
}
