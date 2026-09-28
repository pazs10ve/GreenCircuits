import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PageHead } from "@/components/editorial/page-head"
import { WatchButton } from "@/components/market/watch-button"
import { foUnderlyingBySlug, hasWeeklies } from "@/components/fo/chain-model"
import { OptionChainView } from "@/components/fo/option-chain-view"

export async function generateMetadata({ params }: PageProps<"/fo/[underlying]">): Promise<Metadata> {
  const { underlying } = await params
  const inst = foUnderlyingBySlug(underlying)
  return { title: inst ? `${inst.name} options` : "Option chain" }
}

export default async function OptionChainPage({ params, searchParams }: PageProps<"/fo/[underlying]">) {
  const { underlying } = await params
  const inst = foUnderlyingBySlug(underlying)
  if (!inst) notFound()

  const { expiry } = await searchParams
  const initialExpiry = typeof expiry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : undefined
  const isIndex = inst.kind === "INDEX"
  const expiries = hasWeeklies(inst) ? `Weekly, on ${inst.exchange === "BSE" ? "Thursdays" : "Tuesdays"}` : `Monthly, on the last ${inst.exchange === "BSE" ? "Thursday" : "Tuesday"}`

  return (
    <div className="page pt-6 pb-10">
      <nav aria-label="Breadcrumb" className="text-[13px] text-ink-3">
        <Link href="/fo" className="hover:text-ink">
          Futures and options
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          /
        </span>
        {inst.name}
      </nav>
      <PageHead className="mt-2 md:mt-2" title={`${inst.name} options`} lede={`${expiries} · modelled prices, sample open interest`} actions={<WatchButton instrumentId={inst.id} />} />
      <div className="mt-5">
        <OptionChainView id={inst.id} initialExpiry={initialExpiry} />
      </div>
      <p className="mt-6 text-xs text-ink-3">
        Prices are modelled with Black-76 from the {isIndex ? "index and India VIX" : "share price and a volatility smile"}, not traded; open interest and volume are sample data. Not
        investment advice.
      </p>
    </div>
  )
}
