"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { readDataVersion, type RunInfo, type RunResult, type RunTrade } from "@greencircuits/contracts/lab"
import { Section } from "@/components/editorial/section"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@greencircuits/market/format"
import { LabError, useDeleteRun, useRun } from "@/lib/lab/client"
import { alternativeOf, describe, kindLabel, pct } from "@/lib/lab/describe"
import { holdUp, lede, verdict, worstFall } from "@/lib/lab/report"
import { cn } from "@/lib/utils"
import { DrawdownChart, GrowthChart, epochOf } from "./report-charts"
import { HeldOutTable, MonthlyGrid, NumbersTable, TradesTable } from "./report-tables"

const monthYear = (t: number) => new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(t * 1000)
const longDate = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(epochOf(date) * 1000)

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="text-[13px] text-ink-3">
      <Link href="/lab" className="hover:text-ink">
        Lab
      </Link>
      <span className="mx-1.5" aria-hidden="true">
        /
      </span>
      <Link href="/lab#your-tests" className="hover:text-ink">
        Your tests
      </Link>
    </nav>
  )
}

function Title({ run, kicker }: { run: RunInfo; kicker?: React.ReactNode }) {
  return (
    <header className="mt-3">
      {kicker}
      <h1 className="font-serif text-[2.25rem] leading-[1.06] font-semibold tracking-[-0.02em] md:text-[3rem]">{run.name}</h1>
      <p className="mt-2 text-sm text-ink-2">
        {kindLabel(run.definition)} · {longDate(run.date_from)} to {longDate(run.date_to)}
      </p>
    </header>
  )
}

function Plan({ run }: { run: RunInfo }) {
  return (
    <div className="max-w-[40em] space-y-2 text-[0.9375rem] leading-relaxed text-ink-2">
      {describe(run.definition, run.definition.type === "sip" ? undefined : run.initial_capital).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  )
}

/** A test by id: waiting, running, failed or finished. */
export function RunView({ id }: { id: string }) {
  const { data, error, isPending } = useRun(id)

  if (error) {
    const missing = error instanceof LabError && error.status === 404
    return (
      <div className="max-w-[40em] pt-4">
        <Breadcrumb />
        <h1 className="mt-3 font-serif text-[2.25rem] leading-tight font-semibold">{missing ? "No such test" : "Couldn't load this test"}</h1>
        <p className="mt-4 text-ink-2">
          {missing ? "It may have been deleted, or it belongs to another browser: tests are kept per browser, with no sign-in." : error.message}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/lab">Back to the lab</Link>
        </Button>
      </div>
    )
  }
  if (isPending || !data) {
    return (
      <div className="space-y-4 pt-4" aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="mt-8 h-80 w-full" />
      </div>
    )
  }

  const { run } = data
  if (run.status === "QUEUED" || run.status === "RUNNING") {
    const progress = run.status === "RUNNING" ? (run.progress_pct ?? 5) : 0
    return (
      <div className="pt-4">
        <Breadcrumb />
        <Title run={run} />
        <div className="mt-8 max-w-xl" role="status" aria-live="polite">
          <p className="font-serif text-[1.375rem]">
            {run.status === "QUEUED"
              ? data.queuePosition && data.queuePosition > 1
                ? `Waiting for a worker: ${data.queuePosition - 1} ${data.queuePosition === 2 ? "test is" : "tests are"} ahead of this one.`
                : "Waiting for a worker…"
              : "Running the test…"}
          </p>
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${Math.max(3, progress)}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink-3">This page updates by itself.</p>
        </div>
        <div className="mt-10">
          <Plan run={run} />
        </div>
      </div>
    )
  }
  if (run.status !== "SUCCEEDED" || !data.result) {
    return (
      <div className="pt-4">
        <Breadcrumb />
        <Title run={run} />
        <div className="mt-8 max-w-xl">
          <p className="font-serif text-[1.375rem]">This test didn&apos;t finish.</p>
          <p className="mt-3 text-ink-2">{friendlyError(run.error)}</p>
          <Button asChild className="mt-6">
            <Link href={`/lab/new?run=${run.id}`}>Change the settings and try again</Link>
          </Button>
        </div>
      </div>
    )
  }
  return <Report run={run} result={data.result} trades={data.trades ?? []} />
}

function friendlyError(error: string | null): string {
  if (!error) return "Something went wrong while it ran."
  if (error.includes("Not enough price history")) return "There isn't enough price history in the chosen dates. Try starting later or testing over a longer period."
  return `The engine stopped with: ${error}`
}

function Report({ run, result, trades }: { run: RunInfo; result: RunResult; trades: RunTrade[] }) {
  const router = useRouter()
  const remove = useDeleteRun()
  const d = run.definition
  const m = result.metrics
  const v = verdict(run, result)
  const other = alternativeOf(m.alternative.kind, d)
  const fall = worstFall(result.equity_sample)
  const tookSeconds = run.started_at && run.finished_at ? (Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000 : null
  const [confirming, setConfirming] = useState(false)

  return (
    <article className="pt-4">
      <Breadcrumb />
      <Title
        run={run}
        kicker={
          <p className={cn("mb-2 inline-flex items-center gap-2 text-sm font-medium", v.tone === "up" ? "text-up" : v.tone === "down" ? "text-down" : "text-ink-2")}>
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            {v.text}
          </p>
        }
      />
      <p className="mt-6 max-w-[38em] font-serif text-[1.3125rem] leading-snug text-ink md:text-[1.5rem]">{lede(run, result)}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/lab/new?run=${run.id}`}>Change the rules</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/lab/new">Start a new test</Link>
        </Button>
        {confirming ? (
          <span className="inline-flex items-center gap-2 pl-2 text-sm text-ink-2">
            Delete this test for good?
            <Button
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={async () => {
                await remove.mutateAsync(run.id)
                router.push("/lab#your-tests")
              }}
            >
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </span>
        ) : (
          <Button variant="ghost" className="text-ink-3" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
      </div>

      <div className="mt-12">
        <GrowthChart run={run} result={result} />
        <p className="mt-3 max-w-[48em] text-xs leading-relaxed text-ink-3">
          The shaded part, from {longDate(result.oos_from)}, is the last 30% of the test, held out and reported separately below.
          {m.effective_from !== run.date_from && ` The test starts on ${longDate(m.effective_from)}, the first day with prices for everything in it.`}
        </p>
      </div>

      <div className="mt-20 space-y-20">
        <Section title="The numbers" description={`This test against ${other.phrase}${d.type !== "sip" ? ", on the same starting money" : ""}.`}>
          <NumbersTable run={run} result={result} />
        </Section>

        <Section title="Did it hold up?" description={`The test's last 30%, from ${longDate(result.oos_from)}, is held out: tune the rules on the first part, then see if the edge survives.`}>
          <HeldOutTable result={result} labels={["This test", other.label]} />
          <p className="mt-5 max-w-[40em] text-[0.9375rem] leading-relaxed text-ink-2">{holdUp(result)}</p>
        </Section>

        <Section title="How far it fell" description="How far below its previous peak the strategy was on each day.">
          <DrawdownChart sample={result.equity_sample} />
          {fall && (
            <p className="mt-4 max-w-[40em] text-[0.9375rem] leading-relaxed text-ink-2">
              The worst fall was {pct(-fall.depth, { digits: 1 })}, from a peak in {monthYear(fall.peak)} to the low in {monthYear(fall.trough)}.{" "}
              {fall.recovered ? `It was back at its peak by ${monthYear(fall.recovered)}.` : "It hadn't recovered by the end of the test."}
            </p>
          )}
        </Section>

        <Section title="Month by month">
          <MonthlyGrid monthly={result.monthly_returns} />
        </Section>

        {d.type === "rules" && (
          <Section
            title="Trades"
            description={
              m.trades
                ? `${m.trades} ${m.trades === 1 ? "trade" : "trades"}; ${pct(m.win_rate ?? 0, { digits: 0 })} made money after charges. The average holding was ${formatNumber(m.avg_hold_days ?? 0, 0)} days, and it was invested ${pct(m.exposure ?? 0, { digits: 0 })} of the time.${m.charges ? ` Charges came to ₹${formatNumber(m.charges, 0)}.` : ""}`
                : "The rules never triggered a trade in this period."
            }
          >
            {trades.length > 0 && <TradesTable trades={trades} />}
          </Section>
        )}

        <Section title="How this was tested">
          <ul className="max-w-[44em] list-disc space-y-2 pl-5 text-[0.9375rem] leading-relaxed text-ink-2 marker:text-ink-3">
            <li>
              {readDataVersion(run.data_version).dataset === "real"
                ? "Prices are real daily closes from Yahoo Finance, adjusted for splits and bonus issues; dividends are left out."
                : "Prices are the demo market’s simulated history, not real prices."}{" "}
              Returns are before tax.
            </li>
            {d.type === "sip" && <li>Each instalment is invested at the close on the first trading day of the month{d.dip ? ", or held in cash until the dip rule is met" : ""}.</li>}
            {d.type === "rebalance" && <li>The mix is set at the first day&apos;s close and reset at the close on the first trading day of each April. Bonds earn {formatNumber(d.bondRatePct, 1)}% a year, compounded daily.</li>}
            {d.type === "rules" && (
              <>
                <li>
                  Signals are read on each day&apos;s close and orders fill at the next day&apos;s open, {formatNumber(run.slippage_bps, 1)} basis points worse. Cash is split equally between free
                  slots, in whole shares. Anything still held at the end is sold at the last close.
                </li>
                <li>
                  {d.costs === "DELIVERY"
                    ? "Delivery charges: STT of 0.1% on buys and sells, exchange fees of 0.00297%, SEBI fees of ₹10 a crore, stamp duty of 0.015% on buys, 18% GST on those fees, and ₹15.93 of depository charges per sale. No brokerage."
                    : "No charges were applied."}
                </li>
              </>
            )}
            <li>
              Compared with {other.phrase}
              {m.alternative.kind === "deposit" ? ", compounding at 7% a year" : ""}. Returns a year are {d.type === "sip" ? "money-weighted (XIRR) in the headline and table" : "compound annual growth (CAGR)"}; risk figures are time-weighted.
            </li>
            <li>
              Run {run.engine_version.startsWith("ts") ? "in your browser by the TypeScript engine" : "on the server by the Python engine"} ({run.engine_version}), with prices up
              to {longDate(readDataVersion(run.data_version).lastDate)}
              {tookSeconds != null ? `; it took ${formatNumber(Math.max(tookSeconds, 0.1), 1)} seconds` : ""}.
            </li>
          </ul>
        </Section>
      </div>
    </article>
  )
}
