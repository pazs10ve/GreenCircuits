import Link from "next/link"
import type { Strategy } from "@greencircuits/market/lab"
import { formatDateIST, formatNumber, formatPct } from "@greencircuits/market/format"
import { Sparkline } from "@/components/market/sparkline"
import { cn } from "@/lib/utils"
import { StyleBadge, VersionTag } from "../badges"

export interface StrategySummary {
  cagr: number
  maxDrawdown: number
  sharpe: number
  benchmarkCagr: number
  spark: number[]
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={cn("num text-[13px] font-semibold", className)}>{value}</div>
    </div>
  )
}

/** One strategy with its last sample run: headline metrics and the equity curve. Links to the report. */
export function StrategyCard({ strategy, summary }: { strategy: Strategy; summary: StrategySummary }) {
  const s = strategy
  return (
    <Link
      href={`/lab/backtests/${s.id}`}
      className="group flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <StyleBadge style={s.style} />
            <VersionTag version={s.version} />
          </div>
          <h3 className="truncate text-[13px] font-semibold group-hover:text-primary">{s.name}</h3>
        </div>
        <span className="num shrink-0 text-[11px] text-muted-foreground">{s.interval}</span>
      </div>
      <p className="line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">{s.description}</p>
      <div className="truncate text-[11px] text-muted-foreground" title={s.universe}>
        {s.universe}
      </div>
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_72px] items-end gap-2 border-t pt-3">
        <Metric label="CAGR" value={formatPct(summary.cagr, 1)} className={summary.cagr >= 0 ? "text-up" : "text-down"} />
        <Metric label="Max DD" value={formatPct(summary.maxDrawdown, 1)} className="text-down" />
        <Metric label="Sharpe" value={formatNumber(summary.sharpe, 2)} />
        <Sparkline data={summary.spark} width={72} height={28} className="h-7 w-[72px]" />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex min-w-0 flex-wrap gap-1">
          {s.tags.map((t) => (
            <span key={t} className="rounded-sm bg-muted px-1.5 py-px">
              {t}
            </span>
          ))}
        </span>
        <span className="num shrink-0">Updated {formatDateIST(s.updatedAt, "short")}</span>
      </div>
    </Link>
  )
}
