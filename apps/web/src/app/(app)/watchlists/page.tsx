import type { Metadata } from "next"
import { PageHeader } from "@/components/shell/page-header"
import { SourceBadge } from "@/components/market/source-badge"
import { WatchlistsView } from "@/components/watchlists/watchlists-view"

export const metadata: Metadata = { title: "Watchlists" }

export default function WatchlistsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={<SourceBadge />}
        title="Watchlists"
        description="Follow stocks, indices, commodities and currencies in your own lists, with live prices and one-click alerts."
      />
      <WatchlistsView />
    </div>
  )
}
