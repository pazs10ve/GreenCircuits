import type { Metadata } from "next"
import { screenerSnapshot, type ScreenRow } from "@greencircuits/market/fundamentals"
import { PageHeader } from "@/components/shell/page-header"
import { SampleBadge, SourceBadge } from "@/components/market/source-badge"
import { DEFAULT_PRESET } from "@/components/screener/presets"
import { QueryEditor } from "@/components/screener/query-editor"
import { ScreenResults } from "@/components/screener/results"
import { ScreenList } from "@/components/screener/screen-list"
import { ScreenerActions } from "@/components/screener/screener-actions"
import { ScreenerProvider } from "@/components/screener/screener-context"
import { apiGet } from "@/lib/data/api"
import { getFeed } from "@/lib/data/market"

export const metadata: Metadata = {
  title: "Screener",
  description: "Screen NSE stocks with queries on valuation, returns on capital, growth, ownership and technicals.",
}

export default async function ScreenerPage({ searchParams }: PageProps<"/screener">) {
  const { q } = await searchParams
  // ?q= carries a shared or reloaded screen; otherwise start from the first preset.
  const initialQuery = typeof q === "string" ? q.slice(0, 2000) : DEFAULT_PRESET.query
  const [api, { dataset }] = await Promise.all([apiGet<{ rows: ScreenRow[] }>("/v1/screener/rows", { revalidate: 60 }), getFeed()])
  const rows = api?.rows.length ? api.rows : screenerSnapshot()

  return (
    <ScreenerProvider rows={rows} initialQuery={initialQuery}>
      <div className="flex flex-col gap-4">
        <PageHeader
          eyebrow={
            <>
              <SourceBadge />
              <SampleBadge hideWhenReal />
              <span>{rows.length} NSE stocks · Nifty 50 universe</span>
            </>
          }
          title="Screener"
          description={
            dataset === "real"
              ? "Filter stocks with a query such as roe > 15 AND pe < 30. Fundamentals come from company results, via Yahoo Finance, at the last close."
              : "Filter stocks with a query such as roe > 15 AND pe < 30. Fundamentals are sample data at yesterday's close; prices are simulated."
          }
          actions={<ScreenerActions />}
        />

        <div className="grid gap-4 lg:grid-cols-[264px_minmax(0,1fr)]">
          <ScreenList className="lg:sticky lg:top-16 lg:self-start" />
          <div className="flex min-w-0 flex-col gap-4">
            <QueryEditor />
            <ScreenResults />
          </div>
        </div>
      </div>
    </ScreenerProvider>
  )
}
