import type { Metadata } from "next"
import { screenerSnapshot, type ScreenRow } from "@greencircuits/market/fundamentals"
import { PageHead } from "@/components/editorial/page-head"
import { DEFAULT_PRESET } from "@/components/screener/presets"
import { QueryEditor } from "@/components/screener/query-editor"
import { ScreenResults } from "@/components/screener/results"
import { ScreenList } from "@/components/screener/screen-list"
import { ScreenerActions } from "@/components/screener/screener-actions"
import { ScreenerProvider } from "@/components/screener/screener-context"
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
      <div className="page pt-6 pb-10">
        <PageHead
          title="Screener"
          lede={
            <>
              {rows.length} companies · write what you want, like <code className="font-mono text-[0.95em] text-ink-2">roe &gt; 15 AND pe &lt; 30</code>
              {dataset === "real" ? "" : " · sample figures"}
            </>
          }
          actions={<ScreenerActions />}
        />
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[16.5rem_minmax(0,1fr)]">
          <ScreenList className="min-w-0 lg:sticky lg:top-20 lg:self-start" />
          <div className="min-w-0">
            <QueryEditor />
            <ScreenResults className="mt-5" />
          </div>
        </div>
      </div>
    </ScreenerProvider>
  )
}
