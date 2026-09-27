import type { Metadata } from "next"
import { PageHeader } from "@/components/shell/page-header"
import { SourceBadge } from "@/components/market/source-badge"
import { AlertsView } from "@/components/alerts/alerts-view"

export const metadata: Metadata = { title: "Alerts" }

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={<SourceBadge />}
        title="Alerts"
        description="Price and day-change alerts, checked against every tick and delivered wherever you are in the app."
      />
      <AlertsView />
    </div>
  )
}
