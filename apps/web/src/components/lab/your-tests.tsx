"use client"

import Link from "next/link"
import type { RunSummary } from "@greencircuits/contracts/lab"
import { Skeleton } from "@/components/ui/skeleton"
import { useRuns } from "@/lib/lab/client"
import { alternativeOf, kindLabel, pct } from "@/lib/lab/describe"
import { yearly } from "@/lib/lab/report"
import { cn } from "@/lib/utils"

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso))
const years = (from: string, to: string) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / (365.25 * 86_400_000)))

function Outcome({ run }: { run: RunSummary }) {
  if (run.status === "QUEUED") return <span className="text-ink-3">Waiting…</span>
  if (run.status === "RUNNING") return <span className="text-ink-3">Running…</span>
  if (run.status !== "SUCCEEDED" || !run.metrics) return <span className="text-down">Didn&apos;t finish</span>
  const m = run.metrics
  const sip = run.definition.type === "sip"
  const own = yearly(m, sip)
  const alt = yearly(m.alternative, sip)
  const other = alternativeOf(m.alternative.kind, run.definition)
  return (
    <span>
      <span className={cn("num font-semibold", own >= alt ? "text-up" : "text-down")}>{pct(own)}</span>
      <span className="text-ink-3"> a year, against </span>
      <span className="num text-ink-2">{pct(alt)}</span>
      <span className="text-ink-3"> for {other.label.toLowerCase()}</span>
    </span>
  )
}

/** The visitor's recent tests, newest first. */
export function YourTests() {
  const { data: runs, isPending, isError } = useRuns()

  if (isError) return <p className="text-[0.9375rem] text-ink-2">Couldn&apos;t load your tests just now.</p>
  if (isPending || !runs) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }
  if (!runs.length) {
    return <p className="text-[0.9375rem] text-ink-2">Nothing tested yet. Pick a question above, or start from scratch.</p>
  }
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {runs.map((run) => (
        <li key={run.id}>
          <Link href={`/lab/runs/${run.id}`} className="group grid gap-x-8 gap-y-1 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_5rem] md:items-baseline">
            <span className="min-w-0">
              <span className="block truncate font-serif text-[1.125rem] font-semibold group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{run.name}</span>
              <span className="block text-sm text-ink-3">
                {kindLabel(run.definition)} · {years(run.date_from, run.date_to)} {years(run.date_from, run.date_to) === 1 ? "year" : "years"}
              </span>
            </span>
            <span className="text-[0.9375rem]">
              <Outcome run={run} />
            </span>
            <span className="text-sm text-ink-3 md:text-right">{when(run.queued_at)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
