import { cn } from "@/lib/utils"

/** Shades of ink for the parts of a whole, largest first: owners, sectors, where the money is. */
export const RAMP = ["bg-ink", "bg-ink-2", "bg-ink-3", "bg-ink-3/50", "bg-rule-strong", "bg-surface-2"]

/** Shares of a whole, side by side: rising against falling, who owns a company, a portfolio's sectors. */
export function ShareBar({
  parts,
  height = 8,
  label,
  className,
}: {
  parts: { value: number; className: string }[]
  height?: number
  label?: string
  className?: string
}) {
  return (
    <div role={label ? "img" : undefined} aria-label={label} className={cn("flex gap-0.5", className)} style={{ height }}>
      {parts
        .filter((p) => p.value > 0)
        .map((p, i) => (
          <span key={i} className={cn("min-w-0.5 rounded-[2px]", p.className)} style={{ flexGrow: p.value, flexBasis: 0 }} />
        ))}
    </div>
  )
}
