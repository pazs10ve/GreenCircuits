import type { Metadata } from "next"
import { EQUITIES, INDICES, SECTORS, SIZE_BANDS, type SizeBand } from "@greencircuits/market/catalog"
import type { Sector } from "@greencircuits/market/types"
import { PageHead } from "@/components/editorial/page-head"
import { directoryIndices, directoryStocks } from "@/components/stocks/data"
import { StocksDirectory, type DirectoryView } from "@/components/stocks/stocks-directory"
import { getUniverse } from "@/lib/data/universe"

export const metadata: Metadata = {
  title: "Stocks",
  description: "The Nifty 500's companies, their indices and sectors, with live prices, valuation and where each sits in its 52-week range.",
}

const VIEWS: DirectoryView[] = ["stocks", "indices", "sectors"]

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function StocksPage({ searchParams }: PageProps<"/stocks">) {
  const params = await searchParams
  const view = one(params.view)
  const sector = one(params.sector)
  const size = one(params.size)
  const initialView = VIEWS.includes(view as DirectoryView) ? (view as DirectoryView) : "stocks"
  const initialSector = SECTORS.find((s) => s.toLowerCase() === sector?.toLowerCase()) ?? "all"
  const initialSize = SIZE_BANDS.find((b) => b.toLowerCase() === size?.toLowerCase()) ?? "all"
  const universe = await getUniverse()

  return (
    <div className="page pt-6 pb-10">
      <PageHead
        title="Stocks"
        lede={`The ${EQUITIES.length} companies of the Nifty 500, the ${INDICES.length} indices they belong to and the ${SECTORS.length} sectors they fall into`}
      />
      <StocksDirectory
        stocks={directoryStocks(universe)}
        indices={directoryIndices(universe)}
        initialView={initialView}
        initialSector={initialSector as Sector | "all"}
        initialSize={initialSize as SizeBand | "all"}
        initialQuery={one(params.q) ?? ""}
      />
    </div>
  )
}
