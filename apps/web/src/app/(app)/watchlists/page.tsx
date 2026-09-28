import type { Metadata } from "next"
import { WatchlistsView } from "@/components/watchlists/watchlists-view"

export const metadata: Metadata = { title: "Watchlists" }

export default function WatchlistsPage() {
  return (
    <div className="page pt-6 pb-10">
      <WatchlistsView />
    </div>
  )
}
