"use client"

import Link from "next/link"
import { Clock, FlaskConical } from "lucide-react"
import type { RunSummary } from "@greencircuits/contracts/lab"
import { EmptyNote } from "@/components/editorial/empty-note"
import { Result, Tag } from "@/components/parts/tag"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useRuns } from "@/lib/lab/client"
import { alternativeOf, kindLabel, pct } from "@/lib/lab/describe"
import { yearly } from "@/lib/lab/report"

const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso))
const years = (from: string, to: string) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / (365.25 * 86_400_000)))

/** How a test did, as the lab's result chip when it came out ahead, and a plain one when it didn't. */
function Outcome({ run }: { run: RunSummary }) {
  if (run.status === "QUEUED") return <Tag tone="attn" icon={Clock}>Waiting</Tag>
  if (run.status === "RUNNING") return <Tag tone="attn" icon={Clock}>Running</Tag>
  if (run.status !== "SUCCEEDED" || !run.metrics) return <Tag tone="down">Didn&apos;t finish</Tag>
  const m = run.metrics
  const sip = run.definition.type === "sip"
  const own = yearly(m, sip)
  const alt = yearly(m.alternative, sip)
  const other = alternativeOf(m.alternative.kind, run.definition)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {own >= alt ? <Result>{pct(own)} a year</Result> : <Tag icon={FlaskConical}>{pct(own)} a year</Tag>}
      <span className="text-xs text-ink-3">
        against {pct(alt)} for {other.label.toLowerCase()}
      </span>
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
    return (
      <EmptyNote
        title="Nothing tested yet"
        action={
          <Button asChild variant="brand">
            <Link href="/lab/new">Start a new test</Link>
          </Button>
        }
      >
        Each test you run is listed here with how it did against its alternative, so you can come back to it, change a rule and run it again.
      </EmptyNote>
    )
  }
  return (
    <ul className="-my-3 divide-y divide-rule">
      {runs.map((run) => (
        <li key={run.id}>
          <Link
            href={`/lab/runs/${run.id}`}
            className="group grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1.5 py-3 md:grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem]"
          >
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-brand-soft text-brand" aria-hidden="true">
              <FlaskConical className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold decoration-rule-strong group-hover:underline group-hover:underline-offset-4">{run.name}</span>
              <span className="block text-xs text-ink-3">
                {kindLabel(run.definition)} · {years(run.date_from, run.date_to)} {years(run.date_from, run.date_to) === 1 ? "year" : "years"}
              </span>
            </span>
            <span className="col-start-2 md:col-start-auto">
              <Outcome run={run} />
            </span>
            <span className="hidden text-right text-xs text-ink-3 md:block">{when(run.queued_at)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
