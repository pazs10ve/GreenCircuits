import { cn } from "@/lib/utils"

/** Label over value, for key-stat grids and metric strips. */
export function Stat({
  label,
  value,
  hint,
  tone,
  size = "sm",
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: "up" | "down" | "warning" | "primary"
  size?: "sm" | "lg"
  className?: string
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "num truncate font-semibold",
          size === "lg" ? "text-xl leading-none tracking-tight" : "text-[13px]",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
          tone === "warning" && "text-warning",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </div>
      {hint && <div className="truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

/** Tone for a signed number: green above zero, red below. */
export function toneOf(value: number | null | undefined): "up" | "down" | undefined {
  if (value == null || value === 0 || Number.isNaN(value)) return undefined
  return value > 0 ? "up" : "down"
}
