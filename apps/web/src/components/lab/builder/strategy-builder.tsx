"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { ArrowLeft, Play, Save } from "lucide-react"
import { toast } from "sonner"
import { formatNumber } from "@greencircuits/market/format"
import type { Draft } from "@/lib/lab/draft"
import type { DraftSource } from "@/lib/lab/templates"
import { closestSample, estimate, formatDuration, toDsl } from "@/lib/lab/dsl"
import { validate } from "@/lib/lab/validate"
import { useWatchlists } from "@/lib/stores/watchlists"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shell/page-header"
import { SampleBadge } from "@/components/market/source-badge"
import { BasicsSection, UniverseSection } from "./basics-universe"
import { EntrySection, PeriodSection } from "./period-entry"
import { ExitSection, SizingSection } from "./exit-sizing"
import { CapitalSection, CostsSection } from "./costs-capital"
import { BuilderSummary } from "./builder-summary"

/** Key under which the builder leaves a note for the report page about which sample stands in for the draft. */
export const LAST_DRAFT_KEY = "gc.lab.lastDraft"

function sourceLine(source: DraftSource): string {
  if (source.kind === "strategy") return `Editing ${source.label}; saving adds a new version`
  if (source.kind === "template") return `From the ${source.label} template`
  if (source.kind === "symbol") return `Prefilled for ${source.label}`
  if (source.kind === "screen") return "Universe from a screener query"
  return "Blank strategy"
}

export function StrategyBuilder({ initial, source, maxDate }: { initial: Draft; source: DraftSource; maxDate: string }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(initial)
  const lists = useWatchlists((s) => s.lists)
  const update = (fn: (d: Draft) => Draft) => setDraft((d) => fn(d))

  const watchlist = draft.universe.kind === "watchlist" ? (lists.find((l) => l.id === draft.universe.watchlistId) ?? lists[0]) : undefined
  const wl = watchlist ? { name: watchlist.name, size: watchlist.ids.length } : undefined
  const validation = useMemo(() => validate(draft, maxDate, wl), [draft, maxDate, wl])
  const dsl = useMemo(() => toDsl(draft, wl), [draft, wl])
  const est = useMemo(() => estimate(draft, wl?.size), [draft, wl])

  const jump = (section: string) => document.getElementById(`builder-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" })

  const run = () => {
    if (validation.errors.length > 0) {
      const first = validation.errors[0]!
      toast.error(validation.errors.length === 1 ? "Fix 1 issue before running" : `Fix ${validation.errors.length} issues before running`, {
        description: first.message,
      })
      jump(first.section)
      return
    }
    const sample = closestSample(draft)
    try {
      window.sessionStorage.setItem(LAST_DRAFT_KEY, JSON.stringify({ name: draft.name.trim(), sample }))
    } catch {
      // Storage blocked: the report still works without the note.
    }
    toast.success("Queued · position 2", {
      description: `${draft.name.trim()} · ${formatNumber(est.bars, 0)} bars · about ${formatDuration(est.seconds)} once a worker picks it up`,
    })
    router.push(`/lab/backtests/${sample}?run=new`)
  }

  const save = () => {
    if (!draft.name.trim()) {
      toast.error("Name the strategy before saving")
      jump("basics")
      return
    }
    toast.success("Draft saved", {
      description: source.kind === "strategy" ? `${draft.name.trim()} · becomes a new version when you run it` : `${draft.name.trim()} · not versioned until it runs`,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={
          <>
            <Link href="/lab" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="size-3" /> Strategies
            </Link>
            <span aria-hidden="true">·</span>
            <span>{sourceLine(source)}</span>
          </>
        }
        title={source.kind === "strategy" ? `Edit ${initial.name}` : "New strategy"}
        description="Rules compile to the definition on the right. A run joins the backtests queue and tests on point-in-time data with Indian costs."
        actions={
          <>
            <SampleBadge className="hidden sm:inline-flex" />
            <Button variant="outline" size="lg" onClick={save}>
              <Save /> Save draft
            </Button>
            <Button size="lg" onClick={run}>
              <Play /> Run backtest
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <BasicsSection draft={draft} update={update} validation={validation} />
          <UniverseSection draft={draft} update={update} validation={validation} />
          <PeriodSection draft={draft} update={update} validation={validation} maxDate={maxDate} />
          <EntrySection draft={draft} update={update} validation={validation} />
          <ExitSection draft={draft} update={update} validation={validation} />
          <SizingSection draft={draft} update={update} validation={validation} />
          <CostsSection draft={draft} update={update} validation={validation} />
          <CapitalSection draft={draft} update={update} validation={validation} />
        </div>
        <BuilderSummary dsl={dsl} validation={validation} estimate={est} onRun={run} onSave={save} onJump={jump} />
      </div>
    </div>
  )
}
