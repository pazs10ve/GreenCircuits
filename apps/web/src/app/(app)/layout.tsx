import { connection } from "next/server"
import { AlertWatcher } from "@/components/shell/alert-watcher"
import { Masthead } from "@/components/shell/masthead"
import { MobileTabs } from "@/components/shell/mobile-tabs"
import { SiteFooter } from "@/components/shell/site-footer"
import { StoreHydration } from "@/lib/stores/hydration"
import { STREAM_URL } from "@/lib/data/api"
import { getLiveSnapshot } from "@/lib/data/market"
import { StreamProvider } from "@/lib/stream/provider"
import { marketSeed } from "@greencircuits/market/session"

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  // Each request renders today's market, so this layout is never prerendered at build time.
  await connection()
  const seed = marketSeed()
  // Live when the backend answers with a quote snapshot; otherwise the in-browser demo market.
  const snapshot = STREAM_URL ? await getLiveSnapshot() : null

  return (
    <StreamProvider mode={snapshot ? "live" : "demo"} seed={seed} snapshot={snapshot ?? undefined} streamUrl={STREAM_URL}>
      <StoreHydration />
      <AlertWatcher />
      <div className="flex min-h-svh flex-col">
        <Masthead />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <SiteFooter />
        <MobileTabs />
      </div>
    </StreamProvider>
  )
}
