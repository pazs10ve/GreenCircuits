import { cn } from "@/lib/utils"

/** A row of key figures, each on a tile of its own. */
export function Figures({ className, children, ...rest }: { className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDListElement>) {
  return (
    <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4", className)} {...rest}>
      {children}
    </dl>
  )
}

/**
 * One figure: a small label, the number in the serif, and room for a move
 * beside the label, a few words under it, or a small picture at the bottom.
 * On a card of its own, or on a panel inside another card.
 */
export function Figure({
  label,
  value,
  hint,
  delta,
  visual,
  tone,
  size = "md",
  variant = "card",
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  /** A move or a tag, beside the label. */
  delta?: React.ReactNode
  /** A sparkline or a range marker, under the figure. */
  visual?: React.ReactNode
  /** Colour the figure by the sign of what it measures. */
  tone?: "up" | "down"
  /** "sm" for narrow columns and panels. */
  size?: "md" | "sm"
  /** "panel" for a tile inside a card. */
  variant?: "card" | "panel"
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2",
        variant === "card" ? "rounded-card border border-rule bg-paper p-4" : "rounded-panel bg-panel p-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <dt className="truncate text-xs text-ink-3">{label}</dt>
        {delta}
      </div>
      <dd
        className={cn(
          "figure truncate leading-none",
          size === "sm" ? "text-[1.25rem]" : "text-[1.625rem]",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
        )}
      >
        {value}
      </dd>
      {/* Wraps rather than truncates: a hint cut off mid-word says nothing. */}
      {hint && <dd className="text-xs leading-snug text-pretty text-ink-3">{hint}</dd>}
      {visual && <dd className="mt-1">{visual}</dd>}
    </div>
  )
}

/** Tone for a signed number: green above zero, red below. */
export function toneOf(value: number | null | undefined): "up" | "down" | undefined {
  if (value == null || value === 0 || Number.isNaN(value)) return undefined
  return value > 0 ? "up" : "down"
}
