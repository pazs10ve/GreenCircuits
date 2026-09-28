import type { Metadata } from "next"
import { PortfolioView } from "@/components/portfolio/portfolio-view"

export const metadata: Metadata = { title: "Holdings" }

export default function PortfolioPage() {
  return (
    <div className="page pt-6 pb-10">
      <PortfolioView />
    </div>
  )
}
