import { Info } from "lucide-react"
import { formatCompact, formatINR, formatNumber } from "@greencircuits/market/format"
import { Stat, toneOf } from "@/components/market/stat"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { shortMarginRate, type StrategyMetrics } from "./legs"

function rupees(v: number): string {
  const text = formatINR(Math.abs(v), 0)
  return Math.round(v) === 0 ? text : `${v > 0 ? "+" : "−"}${text}`
}

/** Premium, risk, breakevens, margin and position Greeks for the legs. */
export function StrategySummary({ m, isIndex }: { m: StrategyMetrics; isIndex: boolean }) {
  const credit = m.netPremium >= 0
  const rate = Math.round(shortMarginRate(isIndex) * 100)
  const be = m.breakevens.map((b) => formatNumber(b, isIndex ? 0 : 1)).join(" · ")

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Stat
          label={credit ? "Net credit" : "Net debit"}
          value={formatINR(Math.abs(m.netPremium), 0)}
          hint={credit ? "Premium received" : "Premium paid"}
        />
        <Stat
          label="Max profit"
          value={Number.isFinite(m.maxProfit) ? rupees(m.maxProfit) : "Unlimited"}
          tone={Number.isFinite(m.maxProfit) ? toneOf(Math.round(m.maxProfit)) : "up"}
        />
        <Stat
          label="Max loss"
          value={Number.isFinite(m.maxLoss) ? rupees(m.maxLoss) : "Unlimited"}
          tone={Number.isFinite(m.maxLoss) ? toneOf(Math.round(m.maxLoss)) : "down"}
        />
        <Stat label={m.breakevens.length === 1 ? "Breakeven" : "Breakevens"} value={be || "None"} />
        <Stat label="Reward / risk" value={m.rewardRisk == null ? "–" : formatNumber(m.rewardRisk, 2)} />
        <Stat label="Chance of profit" value={m.pop == null ? "–" : `${formatNumber(m.pop * 100, 0)}%`} hint="Lognormal at ATM IV" />
        <Stat
          label={
            <span className="inline-flex items-center gap-1">
              Margin (approx.)
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="How the margin is estimated" className="cursor-help text-muted-foreground hover:text-foreground">
                    <Info className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64 text-[11px] leading-snug">
                  {rate}% of notional for each unhedged short {isIndex ? "index" : "stock"} option, capped at the spread width when a
                  long option of the same type covers it, plus any net premium paid. Your broker&apos;s SPAN figure will differ.
                </TooltipContent>
              </Tooltip>
            </span>
          }
          value={`₹${formatCompact(m.margin, m.margin >= 1e5 ? 2 : 1)}`}
        />
        <Stat label="P&L now" value={rupees(m.pnlNow)} tone={toneOf(Math.round(m.pnlNow))} hint="Entry prices vs today" />
      </div>
      <div>
        <div className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Position Greeks</div>
        <dl className="grid grid-cols-4 gap-2 rounded-md bg-muted/50 px-3 py-2">
          <Greek label="Delta" value={formatNumber(m.greeks.delta, 1)} />
          <Greek label="Gamma" value={formatNumber(m.greeks.gamma, 3)} />
          <Greek label="Theta / day" value={rupees(m.greeks.theta)} />
          <Greek label="Vega / vol pt" value={rupees(m.greeks.vega)} />
        </dl>
      </div>
    </div>
  )
}

function Greek({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] text-muted-foreground">{label}</dt>
      <dd className="num truncate text-xs font-semibold">{value}</dd>
    </div>
  )
}
