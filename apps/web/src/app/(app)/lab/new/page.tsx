import type { Metadata } from "next"
import { PageHead } from "@/components/editorial/page-head"
import { templateDefinition } from "@greencircuits/contracts/strategy"
import { screenerSnapshot, type ScreenRow } from "@greencircuits/market/fundamentals"
import { Builder, BuilderFromRun } from "@/components/lab/builder"
import { compileQuery } from "@/components/screener/query"
import { liveGet } from "@/lib/data/market"
import { draftFromDefinition, emptyDraft } from "@/lib/lab/draft"
import { fromTemplate } from "@/lib/lab/templates"

export const metadata: Metadata = {
  title: "New test",
  description: "Describe an investing idea and test it on years of daily prices.",
}

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined)

/** A rules test's stocks are capped at fifty. */
const MAX_STOCKS = 50

/** The companies a screen matches today, largest first: the stocks for a rules test started from the screener. */
async function screenMatches(query: string): Promise<{ ids: number[]; total: number } | null> {
  const compiled = compileQuery(query)
  if (!compiled.ok || compiled.empty) return null
  const api = await liveGet<{ rows: ScreenRow[] }>("/v1/screener/rows", { revalidate: 60 })
  const rows = api?.rows.length ? api.rows : screenerSnapshot()
  // No live quotes here: a screen on today's price or change matches on the fundamentals alone.
  const matched = rows
    .filter((r) => compiled.test({ ...r, price: null, changePct: null }))
    .sort((a, b) => (b.mcapCr ?? 0) - (a.mcapCr ?? 0))
  return matched.length ? { ids: matched.slice(0, MAX_STOCKS).map((r) => r.id), total: matched.length } : null
}

export default async function NewTestPage({ searchParams }: PageProps<"/lab/new">) {
  const sp = await searchParams
  const runId = param(sp.run)
  const screen = param(sp.screen)?.slice(0, 2000)
  const matches = !runId && screen ? await screenMatches(screen) : null
  // From the screener, today's matches get the trend rule to start from; the builder can change it.
  const definition = matches ? templateDefinition("trend", matches.ids[0]!, matches.ids) : fromTemplate(param(sp.template), param(sp.symbol))
  const initial = definition ? draftFromDefinition(definition) : emptyDraft()

  return (
    <div className="page pt-6 pb-10">
      <PageHead
        className="mb-5"
        title={runId ? "Change the rules" : "Describe your idea"}
        lede="Every choice below is a rule; the summary reads it back in plain words before it runs"
      />
      {matches && screen && (
        <div className="mb-5 max-w-[48rem] rounded-card bg-brand-soft p-4 text-sm leading-relaxed text-ink-2">
          <p>
            <span className="font-semibold text-brand">From your screen.</span> The stocks below are the{" "}
            {matches.total > matches.ids.length ? `${matches.ids.length} largest of the ${matches.total} companies` : `${matches.total} ${matches.total === 1 ? "company" : "companies"}`} that
            match <code className="font-mono text-[0.9em] text-ink">{screen}</code> today, with a rule to start from.
          </p>
          <p className="mt-2 text-[13px] text-ink-3">
            They were picked with what&apos;s known now, so testing them on past prices flatters the result: a good number is a reason to look closer, not proof.
          </p>
        </div>
      )}
      {screen && !matches && !runId && (
        <p className="mb-5 max-w-[48rem] rounded-card bg-panel p-4 text-sm leading-relaxed text-ink-2">
          No company matches that screen today, so there&apos;s nothing to test yet. Pick the stocks yourself below, or loosen the screen.
        </p>
      )}
      {runId ? <BuilderFromRun runId={runId} fallback={initial} /> : <Builder initial={initial} />}
    </div>
  )
}
