import type { Metadata } from "next"
import { PageHeader } from "@/components/shell/page-header"
import { SourceBadge } from "@/components/market/source-badge"
import { PortfolioView } from "@/components/portfolio/portfolio-view"

export const metadata: Metadata = { title: "Portfolio" }

export default function PortfolioPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={<SourceBadge />}
        title="Portfolio"
        description="Holdings at live prices, allocation and concentration, a one-year look-back against the Nifty, and your tax position."
      />
      <PortfolioView />
    </div>
  )
}
