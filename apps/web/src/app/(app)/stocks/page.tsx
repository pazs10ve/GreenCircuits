import type { Metadata } from "next"
import { EQUITIES, INDICES, SECTORS } from "@greencircuits/market/catalog"
import type { Sector } from "@greencircuits/market/types"
import { PageHead } from "@/components/editorial/page-head"
import { SectionNav } from "@/components/shell/section-nav"
import { directoryIndices, directoryStocks } from "@/components/stocks/data"
import { StocksDirectory, type DirectoryView } from "@/components/stocks/stocks-directory"
import { getUniverse } from "@/lib/data/universe"

export const metadata: Metadata = {
  title: "Stocks",
  description: "The largest NSE stocks, their indices and sectors, with live prices, valuation and where each sits in its 52-week range.",
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
    <div className="mx-auto max-w-[1200px] px-5 pt-6 pb-20">
      <SectionNav section="explore" />
      <PageHead
        title="Stocks"
        lede={`${EQUITIES.length} of the largest companies on the NSE, the ${INDICES.length} indices they belong to and the ${SECTORS.length} sectors they fall into. Search for a company, or sort by what matters to you.`}
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
