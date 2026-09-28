import Link from "next/link"
import { hrefOf } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"
import { formatNumber, formatPrice } from "@greencircuits/market/format"
import { Monogram } from "@/components/parts/monogram"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { boundDecimals } from "./derive"

/** Name over symbol, linking to the instrument page. The current instrument is marked and not linked. */
export function InstrumentCell({ inst, current = false, className }: { inst: Instrument; current?: boolean; className?: string }) {
  const body = (
    <>
      <Monogram text={inst.symbol} size={28} />
      <span className="flex min-w-0 flex-col leading-snug">
        <span className="truncate font-semibold text-ink">
          <span className="decoration-rule-strong group-hover/link:underline group-hover/link:underline-offset-4">{inst.name}</span>
          {current && <span className="ml-1.5 text-xs font-normal text-ink-3">{inst.kind === "EQUITY" ? "this stock" : "this fund"}</span>}
        </span>
        <span className="truncate text-xs text-ink-3">{inst.symbol}</span>
      </span>
    </>
  )
  const base = cn("flex max-w-[260px] min-w-0 items-center gap-2.5", className)
  if (current) return <div className={base}>{body}</div>
  return (
    <Link href={hrefOf(inst)} className={cn("group/link", base)}>
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
      <span className="relative mt-0.5 h-1.5 rounded-full bg-surface-2">
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-paper bg-ink shadow-[0_0_0_1px_var(--rule-strong)] transition-[left] duration-500"
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
