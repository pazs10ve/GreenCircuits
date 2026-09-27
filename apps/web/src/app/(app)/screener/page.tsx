import type { Metadata } from "next"
import { screenerSnapshot, type ScreenRow } from "@greencircuits/market/fundamentals"
import { PageHead } from "@/components/editorial/page-head"
import { DEFAULT_PRESET } from "@/components/screener/presets"
import { QueryEditor } from "@/components/screener/query-editor"
import { ScreenResults } from "@/components/screener/results"
import { ScreenList } from "@/components/screener/screen-list"
import { ScreenerActions } from "@/components/screener/screener-actions"
import { ScreenerProvider } from "@/components/screener/screener-context"
import { SectionNav } from "@/components/shell/section-nav"
import { getFeed, liveGet } from "@/lib/data/market"

export const metadata: Metadata = {
  title: "Screener",
  description: "Screen NSE stocks with queries on valuation, returns on capital, growth, ownership and technicals.",
}

export default async function ScreenerPage({ searchParams }: PageProps<"/screener">) {
  const { q } = await searchParams
  // ?q= carries a shared or reloaded screen; otherwise start from the first preset.
  const initialQuery = typeof q === "string" ? q.slice(0, 2000) : DEFAULT_PRESET.query
  const [api, { dataset }] = await Promise.all([liveGet<{ rows: ScreenRow[] }>("/v1/screener/rows", { revalidate: 60 }), getFeed()])
  const rows = api?.rows.length ? api.rows : screenerSnapshot()

  return (
    <ScreenerProvider rows={rows} initialQuery={initialQuery}>
      <div className="mx-auto max-w-[1200px] px-5 pt-6 pb-20">
        <SectionNav section="explore" />
        <PageHead
          title="Screener"
          lede={
            <>
              Describe the companies you&apos;re looking for, such as <code className="font-mono text-[0.9em] text-ink">roe &gt; 15 AND pe &lt; 30</code>, and see which of
              the {rows.length} match.{" "}
              {dataset === "real"
                ? "Fundamentals come from company results, via Yahoo Finance, at the last close."
                : "Fundamentals are sample data at yesterday's close, and prices are simulated."}
            </>
          }
          actions={<ScreenerActions />}
        />
        <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-10 lg:grid-cols-[16.5rem_minmax(0,1fr)]">
          <ScreenList className="min-w-0 lg:sticky lg:top-20 lg:self-start" />
          <div className="min-w-0">
            <QueryEditor />
            <ScreenResults className="mt-10" />
          </div>
        </div>
      </div>
    </ScreenerProvider>
  )
}
