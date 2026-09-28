"use client"

import { useEffect, useRef, useState } from "react"
import { TestIdeaMenu } from "@/components/lab/test-idea-menu"
import { WatchButton } from "@/components/market/watch-button"
import { getInstrument } from "@greencircuits/market/catalog"
import { formatPct, formatPrice } from "@greencircuits/market/format"
import { useQuote } from "@/lib/stream/hooks"
import { cn } from "@/lib/utils"

/**
 * The name, price and main actions in a slim bar under the masthead. Placed
 * right after the page's own header, it appears once the spot where it sits
 * has scrolled up behind the masthead, and goes when it comes back.
 */
export function StickySummary({ instrumentId }: { instrumentId: number }) {
  const inst = getInstrument(instrumentId)!
  const q = useQuote(instrumentId)
  const [shown, setShown] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    // The masthead covers the top 56px, so the header counts as gone once it's behind it.
    const io = new IntersectionObserver(([e]) => setShown(!e!.isIntersecting && e!.boundingClientRect.top < 56), { rootMargin: "-56px 0px 0px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const currency = inst.kind === "INDEX" ? "" : "₹"
  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      <div
        inert={!shown}
        className={cn(
          "fixed inset-x-0 top-14 z-30 border-b border-rule bg-paper/95 backdrop-blur-md transition-[opacity,translate] duration-200 supports-[backdrop-filter]:bg-paper/85",
          shown ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <div className="page flex h-12 items-center gap-3 md:gap-4">
          <p className="min-w-0 truncate font-serif text-[1.0625rem] font-semibold">{inst.name}</p>
          {q && (
            <p className="flex shrink-0 items-baseline gap-2 text-sm">
              <span className="num">
                {currency}
                {formatPrice(q.ltp, inst.tick)}
              </span>
              <span className={cn("num", q.changePct > 0 ? "text-up" : q.changePct < 0 ? "text-down" : "text-ink-2")}>{formatPct(q.changePct)}</span>
            </p>
          )}
          {/* On a phone the actions are at the screen's foot already. */}
          <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
            <WatchButton instrumentId={instrumentId} size="sm" />
            <TestIdeaMenu instrumentId={instrumentId} size="sm" />
          </div>
        </div>
      </div>
    </>
  )
}
