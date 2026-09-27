import type { Metadata } from "next"
import { AlertsView } from "@/components/alerts/alerts-view"
import { SectionNav } from "@/components/shell/section-nav"

export const metadata: Metadata = { title: "Alerts" }

export default function AlertsPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-6 pb-20">
      <SectionNav section="portfolio" />
      <AlertsView />
    </div>
  )
}
