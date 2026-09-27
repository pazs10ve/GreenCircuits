import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shell/page-header"
import { SourceBadge } from "@/components/market/source-badge"
import { WatchButton } from "@/components/market/watch-button"
import { foUnderlyingBySlug, hasWeeklies } from "@/components/fo/chain-model"
import { OptionChainView } from "@/components/fo/option-chain-view"

export async function generateMetadata({ params }: PageProps<"/fo/[underlying]">): Promise<Metadata> {
  const { underlying } = await params
  const inst = foUnderlyingBySlug(underlying)
  return { title: inst ? `${inst.symbol} option chain` : "Option chain" }
}

export default async function OptionChainPage({ params, searchParams }: PageProps<"/fo/[underlying]">) {
  const { underlying } = await params
  const inst = foUnderlyingBySlug(underlying)
  if (!inst) notFound()

  const { expiry } = await searchParams
  const initialExpiry = typeof expiry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : undefined
  const isIndex = inst.kind === "INDEX"

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={
          <>
            <SourceBadge />
            <span>{inst.exchange} F&amp;O</span>
            <span aria-hidden="true">·</span>
            <span>{isIndex ? "Index options" : "Stock options"}</span>
            <span aria-hidden="true">·</span>
            <span>{hasWeeklies(inst) ? `Weekly expiry on ${inst.exchange === "BSE" ? "Thursdays" : "Tuesdays"}` : "Monthly expiry"}</span>
          </>
        }
        title={`${inst.symbol} option chain`}
        description={`Calls and puts at every strike, priced with Black-76 off the simulated ${isIndex ? "index and India VIX" : "share price and a volatility smile"}. Open interest is sample data. Click a price to build a strategy.`}
        actions={
          <>
            <Button variant="outline" size="lg" asChild>
              <Link href="/fo">
                <LayoutGrid /> F&amp;O overview
              </Link>
            </Button>
            <WatchButton instrumentId={inst.id} />
          </>
        }
      />
      <OptionChainView id={inst.id} initialExpiry={initialExpiry} />
    </div>
  )
}
