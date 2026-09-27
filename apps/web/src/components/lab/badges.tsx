import type { RunStatus } from "@/lib/lab/runs"
import { cn } from "@/lib/utils"

/** "Rules" or "Options" tag, in the same mono style as the event kinds on /markets. */
export function StyleBadge({ style, className }: { style: "RULES" | "OPTIONS"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center rounded-sm border px-1.5 font-mono text-[9px] font-medium tracking-wide uppercase",
        style === "OPTIONS" ? "border-chart-3/40 text-chart-3" : "border-chart-2/40 text-chart-2",
        className,
      )}
    >
      {style === "OPTIONS" ? "Options" : "Rules"}
    </span>
  )
}

export function VersionTag({ version, className }: { version: number; className?: string }) {
  return (
    <span className={cn("num inline-flex h-[18px] items-center rounded-sm bg-muted px-1.5 font-mono text-[10px] text-muted-foreground", className)}>
      v{version}
    </span>
  )
}

const STATUS: Record<RunStatus, { label: string; dot: string; text: string }> = {
  QUEUED: { label: "Queued", dot: "bg-muted-foreground/70", text: "text-muted-foreground" },
  RUNNING: { label: "Running", dot: "bg-primary animate-live", text: "text-primary" },
  SUCCEEDED: { label: "Done", dot: "bg-brand", text: "text-foreground" },
  FAILED: { label: "Failed", dot: "bg-destructive", text: "text-destructive" },
  CANCELLED: { label: "Cancelled", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
}

/** Coloured dot and label for a backtest run's status (lab.run_status). */
export function RunStatusLabel({ status, className, children }: { status: RunStatus; className?: string; children?: React.ReactNode }) {
  const s = STATUS[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap", s.text, className)}>
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", s.dot)} />
      {children ?? s.label}
    </span>
  )
}

/** Header badge variant with a border, for the report page. */
export function RunStatusBadge({ status, children }: { status: RunStatus; children?: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center rounded-sm border px-1.5">
      <RunStatusLabel status={status} className="text-[10px] tracking-wide uppercase">
        {children}
      </RunStatusLabel>
    </span>
  )
}
