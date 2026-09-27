import { cn } from "@/lib/utils"

/** A row of key figures: small label, big serif number, a line of context. */
export function Figures({ className, children, ...rest }: { className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDListElement>) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:grid-cols-6", className)} {...rest}>
      {children}
    </dl>
  )
}

export function Figure({
  label,
  value,
  hint,
  tone,
  size = "md",
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  /** Colour the figure by the sign of what it measures. */
  tone?: "up" | "down"
  /** "sm" for narrow columns, such as a sidebar. */
  size?: "md" | "sm"
  className?: string
}) {
  return (
    <div className={cn("min-w-0 border-t border-rule pt-3", className)}>
      <dt className="truncate text-[13px] text-ink-3">{label}</dt>
      <dd
        className={cn(
          "figure mt-1.5 truncate leading-none",
          size === "sm" ? "text-[1.25rem]" : "text-[1.625rem]",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
        )}
      >
        {value}
      </dd>
      {hint && <dd className="mt-2 truncate text-sm text-ink-2">{hint}</dd>}
    </div>
  )
}

/** Tone for a signed number: green above zero, red below. */
export function toneOf(value: number | null | undefined): "up" | "down" | undefined {
  if (value == null || value === 0 || Number.isNaN(value)) return undefined
  return value > 0 ? "up" : "down"
}
