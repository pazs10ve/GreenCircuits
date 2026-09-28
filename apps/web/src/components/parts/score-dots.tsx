import type { Tone } from "@greencircuits/market/research/company"
import { cn } from "@/lib/utils"

const DOT: Record<Tone, string> = { good: "bg-up", neutral: "bg-rule-strong", caution: "bg-down" }
const WORD: Record<Tone, string> = { good: "strong", neutral: "fair", caution: "weak" }

/** The scorecard's five measures, always in this order. */
export const PILLAR_NAMES = ["Value", "Growth", "Profit", "Debt", "Owners"] as const

/**
 * A company's scorecard in five dots: valuation, growth, profitability,
 * balance sheet and ownership, each strong, fair or weak. The same dots sit on
 * its page, in a comparison and in lists, so a reader learns them once.
 */
export function ScoreDots({ tones, size = 8, className }: { tones: Tone[]; size?: number; className?: string }) {
  return (
    <span role="img" aria-label={`Scorecard: ${tones.map((t, i) => `${PILLAR_NAMES[i]} ${WORD[t]}`).join(", ")}`} className={cn("inline-flex shrink-0 gap-1", className)}>
      {tones.map((t, i) => (
        <span key={i} className={cn("rounded-full", DOT[t])} style={{ width: size, height: size }} />
      ))}
    </span>
  )
}

export function ScoreLegend({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3 text-xs text-ink-3", className)}>
      {(["good", "neutral", "caution"] as const).map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", DOT[t])} />
          {WORD[t][0]!.toUpperCase() + WORD[t].slice(1)}
        </span>
      ))}
    </span>
  )
}
