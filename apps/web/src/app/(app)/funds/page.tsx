import type { Metadata } from "next"
import { ETF_CATEGORIES, ETFS, TRUSTS, slugify } from "@greencircuits/market/catalog"
import { FUND_CATEGORIES } from "@greencircuits/market/funds"
import { PageHead } from "@/components/editorial/page-head"
import { listedFundStatics } from "@/components/funds/data"
import { FundsDirectory } from "@/components/funds/funds-directory"
import { MutualFunds } from "@/components/funds/mutual-funds"
import { SegmentedLinks } from "@/components/market/segmented-links"
import { benchmarkReturns, getFundCategories, getSchemes } from "@/lib/data/funds"
import { getUniverse } from "@/lib/data/universe"

export const metadata: Metadata = {
  title: "Funds",
  description: "Mutual funds by category with their returns, and every ETF, REIT and InvIT on the NSE with live prices.",
}

type View = "mutual" | "etfs" | "trusts"

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** The categories in the order the page lists them: a category from the URL, else flexi cap, the broadest. */
const ORDER = FUND_CATEGORIES.flatMap((g) => g.categories)

export default async function FundsPage({ searchParams }: PageProps<"/funds">) {
  const params = await searchParams
  const view: View = one(params.view) === "etfs" ? "etfs" : one(params.view) === "trusts" ? "trusts" : "mutual"
  const { categories, source } = await getFundCategories()
  const schemeCount = categories.reduce((s, c) => s + c.schemes, 0)
  const reits = TRUSTS.filter((t) => t.kind === "REIT").length

  const views = [
    { value: "mutual", label: `Mutual funds ${schemeCount}`, href: "/funds" },
    { value: "etfs", label: `ETFs ${ETFS.length}`, href: "/funds?view=etfs" },
    { value: "trusts", label: `REITs and InvITs ${TRUSTS.length}`, href: "/funds?view=trusts" },
  ]

  let body: React.ReactNode
  if (view === "mutual") {
    const wanted = one(params.category)
    const known = ORDER.filter((c) => categories.some((x) => x.category === c))
    const category = known.find((c) => slugify(c) === wanted) ?? (known.includes("Flexi cap") ? "Flexi cap" : known[0]!)
    const [schemes, benchmark] = await Promise.all([getSchemes(category), benchmarkReturns(category)])
    body = <MutualFunds categories={categories} category={category} schemes={schemes} benchmark={benchmark} real={source === "api"} />
  } else {
    const universe = await getUniverse()
    const holds = one(params.holds)
    body = (
      <FundsDirectory
        view={view}
        statics={listedFundStatics(universe)}
        initialCategory={ETF_CATEGORIES.find((c) => c.toLowerCase() === holds?.toLowerCase()) ?? "all"}
        initialQuery={one(params.q) ?? ""}
      />
    )
  }

  return (
    <div className="page pt-6 pb-10">
      <PageHead
        title="Funds"
        lede={`${schemeCount} mutual funds' direct plans${source === "api" ? "" : " (a sample)"}, ${ETFS.length} ETFs, ${reits} REITs and ${TRUSTS.length - reits} InvITs`}
      />
      <SegmentedLinks options={views} current={view} aria-label="Kind of fund" className="mt-5" />
      {body}
    </div>
  )
}
