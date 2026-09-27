import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { USAGE } from "@/lib/lab/runs"
import { formatNumber } from "@greencircuits/market/format"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

function Tile({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 p-3", className)}>
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      {children}
      {hint && <div className="line-clamp-2 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

/** Plan quota, queue depth and compute used: what a user checks before pressing Run. Sample values. */
export function UsageStrip() {
  const u = USAGE
  const runsPct = (u.backtestsToday / u.backtestsLimit) * 100
  const computePct = (u.computeMinutes / u.computeLimit) * 100
  return (
    <section
      aria-label="Backtest usage"
      className="grid grid-cols-2 rounded-lg border bg-card lg:grid-cols-4"
    >
      <Tile className="border-r border-b lg:border-b-0" label="Backtests today" hint={`${u.plan} plan · resets at 00:00 IST`}>
        <div className="num text-[15px] leading-none font-semibold">
          {u.backtestsToday} <span className="text-xs font-normal text-muted-foreground">of {u.backtestsLimit}</span>
        </div>
        <Progress value={runsPct} aria-label="Backtests used today" />
      </Tile>
      <Tile className="border-b lg:border-r lg:border-b-0" label="Queue" hint={`${u.workersBusy} of ${u.workers} workers busy · backtests queue`}>
        <div className="flex items-center gap-2 text-[15px] leading-none font-semibold">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary animate-live" />
          <span className="num">
            {u.jobsAhead} job ahead <span className="text-xs font-normal text-muted-foreground">· ~{u.waitSeconds} s</span>
          </span>
        </div>
        <div className="h-1" />
      </Tile>
      <Tile className="border-r" label="Compute this month" hint="Worker time across all runs">
        <div className="num text-[15px] leading-none font-semibold">
          {formatNumber(u.computeMinutes, 1)} <span className="text-xs font-normal text-muted-foreground">of {u.computeLimit} min</span>
        </div>
        <Progress value={computePct} aria-label="Compute minutes used this month" />
      </Tile>
      <Tile
        label="Queue priority"
        hint={
          <Link href="/pricing" className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline">
            Pro runs first, 200 backtests a day <ArrowUpRight className="size-3" />
          </Link>
        }
      >
        <div className="num text-[15px] leading-none font-semibold">
          {u.priority} <span className="text-xs font-normal text-muted-foreground">· lower runs first</span>
        </div>
        <div className="h-1" />
      </Tile>
    </section>
  )
}
