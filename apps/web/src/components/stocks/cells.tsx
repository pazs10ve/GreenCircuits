import Link from "next/link"
import type { Instrument } from "@greencircuits/market/types"
import { formatNumber, formatPrice } from "@greencircuits/market/format"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { boundDecimals } from "./derive"

/** Symbol over name, linking to the instrument page. The current instrument is marked and not linked. */
export function InstrumentCell({ inst, current = false, className }: { inst: Instrument; current?: boolean; className?: string }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <span className="group-hover/link:underline">{inst.symbol}</span>
        {current && (
          <span className="rounded-sm bg-primary/15 px-1 py-px text-[9px] font-semibold tracking-wide text-primary uppercase">
            This stock
          </span>
        )}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">{inst.name}</span>
    </>
  )
  const base = cn("flex max-w-[200px] min-w-0 flex-col leading-tight", className)
  if (current) return <div className={base}>{body}</div>
  return (
    <Link href={`/stocks/${inst.slug}`} className={cn("group/link", base)}>
      {body}
    </Link>
  )
}

/** Compact low–high bar with a marker at the current price, for table cells. */
export function MiniRange({
  low,
  high,
  value,
  tick = 0.05,
  label,
  className,
}: {
  low: number | undefined
  high: number | undefined
  value: number | undefined
  tick?: number
  label: string
  className?: string
}) {
  if (low == null || high == null || value == null) return <Skeleton className={cn("h-5 w-24", className)} />
  const pos = Math.min(1, Math.max(0, (value - low) / Math.max(high - low, 1e-9))) * 100
  const text = `${label}: ${formatPrice(low, tick)} to ${formatPrice(high, tick)}, now ${formatPrice(value, tick)}`
  return (
    <span role="img" aria-label={text} title={text} className={cn("inline-flex w-24 flex-col gap-1 align-middle", className)}>
      <span className="relative mt-0.5 h-1 rounded-full bg-muted">
        <span className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/30" style={{ width: `${pos}%` }} />
        <span
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-card transition-[left] duration-500"
          style={{ left: `${pos}%` }}
        />
      </span>
      <span className="num flex justify-between gap-1 text-[10px] leading-none text-muted-foreground">
        <span>{formatNumber(low, boundDecimals(low))}</span>
        <span>{formatNumber(high, boundDecimals(high))}</span>
      </span>
    </span>
  )
}

/** Small uppercase column header for hand-built tables, matching DataTable. */
export const TH =
  "h-8 border-b bg-card px-3 text-[10px] font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase"

/** Body cell for hand-built tables, matching DataTable. */
export const TD = "h-9 border-b border-border/60 px-3 whitespace-nowrap"
