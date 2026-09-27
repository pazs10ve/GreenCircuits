import type { Metadata } from "next"
import { PortfolioView } from "@/components/portfolio/portfolio-view"
import { SectionNav } from "@/components/shell/section-nav"

export const metadata: Metadata = { title: "Holdings" }

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-6 pb-20">
      <SectionNav section="portfolio" />
      <PortfolioView />
    </div>
  )
}
