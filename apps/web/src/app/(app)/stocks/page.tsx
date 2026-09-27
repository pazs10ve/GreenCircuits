import type { Metadata } from "next"
import Link from "next/link"
import { ListFilter } from "lucide-react"
import { EQUITIES, INDICES, SECTORS } from "@greencircuits/market/catalog"
import type { Sector } from "@greencircuits/market/types"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shell/page-header"
import { SampleBadge, SourceBadge } from "@/components/market/source-badge"
import { directoryIndices, directoryStocks } from "@/components/stocks/data"
import { getUniverse } from "@/lib/data/universe"
import { StocksDirectory, type DirectoryView } from "@/components/stocks/stocks-directory"

export const metadata: Metadata = {
  title: "Stocks",
  description: "Every NSE stock and index in the GreenCircuits universe with live prices, valuation, sector moves and 52-week position.",
}

const VIEWS: DirectoryView[] = ["stocks", "indices", "sectors"]

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function StocksPage({ searchParams }: PageProps<"/stocks">) {
  const params = await searchParams
  const view = one(params.view)
  const sector = one(params.sector)
  const initialView = VIEWS.includes(view as DirectoryView) ? (view as DirectoryView) : "stocks"
  const initialSector = SECTORS.find((s) => s.toLowerCase() === sector?.toLowerCase()) ?? "all"
  const universe = await getUniverse()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={
          <>
            <SourceBadge />
            <SampleBadge hideWhenReal />
            <span>NSE · BSE</span>
          </>
        }
        title={
          <>
            Stocks <span className="num font-normal text-muted-foreground">{EQUITIES.length}</span>
          </>
        }
        description={`${EQUITIES.length} stocks, ${INDICES.length} indices and ${SECTORS.length} sectors with live prices, valuation and where each sits in its 52-week range.`}
        actions={
          <Button variant="outline" size="lg" asChild>
            <Link href="/screener">
              <ListFilter /> Screen stocks
            </Link>
          </Button>
        }
      />
      <StocksDirectory
        stocks={directoryStocks(universe)}
        indices={directoryIndices(universe)}
        initialView={initialView}
        initialSector={initialSector as Sector | "all"}
        initialQuery={one(params.q) ?? ""}
      />
    </div>
  )
}
