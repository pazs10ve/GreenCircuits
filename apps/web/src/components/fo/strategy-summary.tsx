import { Info } from "lucide-react"
import { formatCompact, formatINR, formatNumber } from "@greencircuits/market/format"
import { Figure, toneOf } from "@/components/editorial/figures"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { shortMarginRate, type StrategyMetrics } from "./legs"

function rupees(v: number): string {
  const text = formatINR(Math.abs(v), 0)
  return Math.round(v) === 0 ? text : `${v > 0 ? "+" : "−"}${text}`
}

/**
 * What the legs add up to: the most they can make and lose as figures, then
 * premium, breakevens, odds, margin and P&L as a compact list, and the
 * position's Greeks.
 */
export function StrategySummary({ m, isIndex }: { m: StrategyMetrics; isIndex: boolean }) {
  const credit = m.netPremium >= 0
  const rate = Math.round(shortMarginRate(isIndex) * 100)
  const be = m.breakevens.map((b) => formatNumber(b, isIndex ? 0 : 1)).join(" · ")
  const rows: { label: React.ReactNode; value: string; tone?: "up" | "down"; title?: string; wide?: boolean }[] = [
    // Two breakevens need the whole line.
    { label: m.breakevens.length === 1 ? "Breakeven" : "Breakevens", value: be || "None", wide: m.breakevens.length > 1 },
    { label: credit ? "Net credit" : "Net debit", value: formatINR(Math.abs(m.netPremium), 0), title: credit ? "Premium received" : "Premium paid" },
    { label: "Reward / risk", value: m.rewardRisk == null ? "–" : formatNumber(m.rewardRisk, 2) },
    { label: "Chance of profit", value: m.pop == null ? "–" : `${formatNumber(m.pop * 100, 0)}%`, title: "Lognormal, at the at-the-money volatility" },
    {
      label: (
        <span className="inline-flex items-center gap-1">
          Margin, about
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="How the margin is estimated" className="cursor-help text-ink-3 hover:text-ink">
                <Info className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64 text-xs leading-snug">
              {rate}% of notional for each unhedged short {isIndex ? "index" : "stock"} option, capped at the spread width when a long option of the same type
              covers it, plus any net premium paid. Your broker&apos;s SPAN figure will differ.
            </TooltipContent>
          </Tooltip>
        </span>
      ),
      value: `₹${formatCompact(m.margin, m.margin >= 1e5 ? 2 : 1)}`,
    },
    { label: "P&L now", value: rupees(m.pnlNow), tone: toneOf(Math.round(m.pnlNow)), title: "Entry prices against today's" },
  ]

  return (
    <div className="space-y-2.5">
      <dl className="grid grid-cols-2 gap-2">
        <Figure
          variant="panel"
          size="sm"
          label="Max profit"
          value={Number.isFinite(m.maxProfit) ? rupees(m.maxProfit) : "Unlimited"}
          tone={Number.isFinite(m.maxProfit) ? toneOf(Math.round(m.maxProfit)) : "up"}
        />
        <Figure
          variant="panel"
          size="sm"
          label="Max loss"
          value={Number.isFinite(m.maxLoss) ? rupees(m.maxLoss) : "Unlimited"}
          tone={Number.isFinite(m.maxLoss) ? toneOf(Math.round(m.maxLoss)) : "down"}
        />
      </dl>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-panel bg-panel px-3 py-2">
        {rows.map((r, i) => (
          <div key={i} className={cn("flex min-w-0 items-baseline justify-between gap-2 py-1", r.wide && "col-span-2")} title={r.title}>
            <dt className="truncate text-xs text-ink-3">{r.label}</dt>
            <dd className={cn("num text-[13px] font-semibold whitespace-nowrap", r.tone === "up" && "text-up", r.tone === "down" && "text-down")}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-panel bg-panel p-3">
        <h3 className="mb-1.5 text-xs text-ink-3">The position&apos;s Greeks</h3>
        <dl className="grid grid-cols-4 gap-3">
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
      <dt className="truncate text-[11px] text-ink-3">{label}</dt>
      <dd className="num mt-0.5 truncate text-[13px] font-semibold">{value}</dd>
    </div>
  )
}
