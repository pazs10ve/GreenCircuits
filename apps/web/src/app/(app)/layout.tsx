import { connection } from "next/server"
import { toWire } from "@greencircuits/contracts"
import { AlertWatcher } from "@/components/shell/alert-watcher"
import { Masthead } from "@/components/shell/masthead"
import { MobileTabs } from "@/components/shell/mobile-tabs"
import { SectionBar } from "@/components/shell/section-bar"
import { StoreHydration } from "@/lib/stores/hydration"
import { STREAM_URL } from "@/lib/data/api"
import { getFeed } from "@/lib/data/market"
import { StreamProvider } from "@/lib/stream/provider"
import { marketSeed } from "@greencircuits/market/session"

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  // Each request renders today's market, so this layout is never prerendered at build time.
  await connection()
  const seed = marketSeed()
  // Live when the backend answers with a quote snapshot; otherwise the in-browser demo market.
  const feed = await getFeed()

  return (
    <StreamProvider
      mode={feed.quotes ? "live" : "demo"}
      seed={seed}
      // The wire format: a third of the size, and every page carries it.
      snapshot={feed.quotes?.map(toWire)}
      streamUrl={STREAM_URL}
      source={feed.source}
      dataset={feed.dataset}
      today={feed.today}
    >
      <StoreHydration />
      <AlertWatcher />
      <div className="flex min-h-svh flex-col">
        <Masthead />
        <SectionBar />
        <main className="flex-1">{children}</main>
        {/* Room under the page for the tab bar that phones keep at the bottom of the screen. */}
        <div className="h-16 shrink-0 md:hidden" aria-hidden="true" />
        <MobileTabs />
      </div>
    </StreamProvider>
  )
}
