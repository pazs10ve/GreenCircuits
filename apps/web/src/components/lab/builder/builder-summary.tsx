"use client"

import { useState } from "react"
import { CircleCheck, CircleX, Copy, Play, Save, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { formatNumber } from "@greencircuits/market/format"
import { formatDuration, type Estimate } from "@/lib/lab/dsl"
import { USAGE } from "@/lib/lab/runs"
import type { Check, Validation } from "@/lib/lab/validate"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Panel } from "@/components/shell/page-header"
import { cn } from "@/lib/utils"

function CheckItem({ check, tone, onJump }: { check: Check; tone: "error" | "warning"; onJump: (section: string) => void }) {
  const Icon = tone === "error" ? CircleX : TriangleAlert
  return (
    <li>
      <button
        type="button"
        onClick={() => onJump(check.section)}
        className="flex w-full items-start gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-muted/60"
      >
        <Icon className={cn("mt-px size-3.5 shrink-0", tone === "error" ? "text-destructive" : "text-warning")} />
        <span className={tone === "error" ? "text-foreground" : "text-muted-foreground"}>{check.message}</span>
      </button>
    </li>
  )
}

/** The generated definition, what will stop a run, and what the run will cost in time and quota. */
export function BuilderSummary({
  dsl,
  validation,
  estimate,
  onRun,
  onSave,
  onJump,
}: {
  dsl: string
  validation: Validation
  estimate: Estimate
  onRun: () => void
  onSave: () => void
  onJump: (section: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const { errors, warnings, passes } = validation
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dsl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy to the clipboard")
    }
  }
  const quotaLeft = USAGE.backtestsLimit - USAGE.backtestsToday

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-16 lg:max-h-[calc(100svh-5rem)] lg:overflow-y-auto lg:pb-2 scrollbar-thin">
      <Panel
        title="Definition"
        description="What the engine will parse and version"
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label="Copy definition">
            <Copy /> {copied ? "Copied" : "Copy"}
          </Button>
        }
      >
        <pre className="scrollbar-thin max-h-80 overflow-auto p-3 font-mono text-[10.5px] leading-[1.6] whitespace-pre text-foreground/90" aria-label="Generated strategy definition">
          {dsl}
        </pre>
      </Panel>

      <Panel
        title="Checks"
        description={errors.length ? `${errors.length} to fix before running` : warnings.length ? "Ready, with warnings" : "Ready to run"}
      >
        <div className="space-y-2 p-3 text-[11px]" aria-live="polite">
          {errors.length > 0 && (
            <ul className="space-y-0.5">
              {errors.map((c) => (
                <CheckItem key={c.message} check={c} tone="error" onJump={onJump} />
              ))}
            </ul>
          )}
          {warnings.length > 0 && (
            <ul className="space-y-0.5">
              {warnings.map((c) => (
                <CheckItem key={c.message} check={c} tone="warning" onJump={onJump} />
              ))}
            </ul>
          )}
          <ul className="space-y-0.5 text-muted-foreground">
            {passes.map((p) => (
              <li key={p} className="flex items-start gap-2 px-1 py-0.5">
                <CircleCheck className="mt-px size-3.5 shrink-0 text-brand" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel title="Run estimate" description="On one worker, after it leaves the queue">
        <dl className="num grid grid-cols-2 gap-x-4 gap-y-2.5 p-3 text-[11px]">
          <div>
            <dt className="text-muted-foreground">Bars to load</dt>
            <dd className="text-[13px] font-semibold">{formatNumber(estimate.bars, 0)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Symbols</dt>
            <dd className="text-[13px] font-semibold">{formatNumber(estimate.symbols, 0)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Run time</dt>
            <dd className="text-[13px] font-semibold">≈ {formatDuration(estimate.seconds)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Queue</dt>
            <dd className="text-[13px] font-semibold">
              {USAGE.jobsAhead} ahead · ~{USAGE.waitSeconds} s
            </dd>
          </div>
          <div className="col-span-2 space-y-1.5">
            <dt className="flex justify-between text-muted-foreground">
              <span>Backtests today · {USAGE.plan} plan</span>
              <span>
                {USAGE.backtestsToday} of {USAGE.backtestsLimit}
              </span>
            </dt>
            <dd>
              <Progress value={(USAGE.backtestsToday / USAGE.backtestsLimit) * 100} aria-label="Backtests used today" />
            </dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 border-t p-3">
          <Button type="button" size="lg" className="w-full" onClick={onRun} disabled={quotaLeft <= 0}>
            <Play /> Run backtest
          </Button>
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={onSave}>
            <Save /> Save draft
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Uses 1 of {quotaLeft} runs left today. Identical runs return the cached result and don&apos;t count.
          </p>
        </div>
      </Panel>
    </div>
  )
}
