import Link from "next/link"
import type { Instrument } from "@greencircuits/market/types"
import { formatNumber, formatPrice } from "@greencircuits/market/format"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { boundDecimals } from "./derive"

/** Name over symbol, linking to the instrument page. The current instrument is marked and not linked. */
export function InstrumentCell({ inst, current = false, className }: { inst: Instrument; current?: boolean; className?: string }) {
  const body = (
    <>
      <span className="truncate font-medium text-ink">
        <span className="group-hover/link:underline group-hover/link:decoration-1 group-hover/link:underline-offset-4">{inst.name}</span>
        {current && <span className="ml-1.5 text-xs font-normal text-ink-3">this stock</span>}
      </span>
      <span className="truncate text-[13px] text-ink-3">{inst.symbol}</span>
    </>
  )
  const base = cn("flex max-w-[240px] min-w-0 flex-col leading-snug", className)
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
      <span className="relative mt-0.5 h-1 rounded-full bg-surface-2">
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink transition-[left] duration-500"
          style={{ left: `${pos}%` }}
        />
      </span>
      <span className="num flex justify-between gap-1 text-[11px] leading-none text-ink-3">
        <span>{formatNumber(low, boundDecimals(low))}</span>
        <span>{formatNumber(high, boundDecimals(high))}</span>
      </span>
    </span>
  )
}
