import type { Metadata } from "next"
import { SectionNav } from "@/components/shell/section-nav"
import { WatchlistsView } from "@/components/watchlists/watchlists-view"

export const metadata: Metadata = { title: "Watchlists" }

export default function WatchlistsPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-6 pb-20">
      <SectionNav section="portfolio" />
      <WatchlistsView />
    </div>
  )
}
