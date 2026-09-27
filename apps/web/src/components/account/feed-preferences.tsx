"use client"

import type { Preferences, Style } from "@greencircuits/contracts/account"
import { SECTORS } from "@greencircuits/market/catalog"
import { cn } from "@/lib/utils"

const STYLES: { style: Style; title: string; blurb: string }[] = [
  { style: "long_term", title: "Investing for the long term", blurb: "Results, dividends and 52-week highs and lows come first." },
  { style: "trading", title: "Testing trading ideas", blurb: "What your rules would do today, and unusual moves, come first." },
  { style: "both", title: "A bit of both", blurb: "An even mix." },
]

/** How the feed is tuned: investing style, and sectors whose biggest movers join it. */
export function FeedPreferencesFields({ value, onChange }: { value: Preferences; onChange: (next: Preferences) => void }) {
  const toggle = (sector: Preferences["sectors"][number]) =>
    onChange({ ...value, sectors: value.sectors.includes(sector) ? value.sectors.filter((s) => s !== sector) : [...value.sectors, sector] })
  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">What brings you here?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {STYLES.map((s) => (
            <label
              key={s.style}
              className={cn(
                "cursor-pointer rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/30",
                value.style === s.style ? "border-ink bg-card" : "border-rule hover:border-ink-3/60",
              )}
            >
              <input type="radio" name="style" value={s.style} checked={value.style === s.style} onChange={() => onChange({ ...value, style: s.style })} className="sr-only" />
              <span className="block font-serif text-[1.0625rem] leading-snug font-semibold">{s.title}</span>
              <span className="mt-1 block text-sm text-ink-2">{s.blurb}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Sectors you follow</legend>
        <p className="mb-3 text-sm text-ink-2">Each day, the biggest mover in each one joins your feed, even if you don&apos;t follow the stock.</p>
        <div className="flex flex-wrap gap-2">
          {SECTORS.map((sector) => {
            const on = value.sectors.includes(sector)
            return (
              <button
                key={sector}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(sector)}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-sm transition-colors",
                  on ? "border-ink bg-ink text-paper" : "border-rule bg-card text-ink-2 hover:border-ink-3/60 hover:text-ink",
                )}
              >
                {sector}
              </button>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}
