import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"
import { SAMPLE_STRATEGIES } from "@greencircuits/market/lab"
import { strategySummary } from "@/lib/lab/report"
import { recentRuns } from "@/lib/lab/runs"
import { Button } from "@/components/ui/button"
import { PageHeader, Panel } from "@/components/shell/page-header"
import { SampleBadge } from "@/components/market/source-badge"
import { UsageStrip } from "@/components/lab/home/usage-strip"
import { StrategyCard } from "@/components/lab/home/strategy-card"
import { RunsTable } from "@/components/lab/home/runs-table"
import { TemplateGallery } from "@/components/lab/home/templates"
import { ImportDialog } from "@/components/lab/home/import-dialog"

export const metadata: Metadata = { title: "Strategy lab" }

export default function LabPage() {
  const now = new Date()
  const strategies = SAMPLE_STRATEGIES.map((s) => ({ strategy: s, summary: strategySummary(s, now) }))
  const runs = recentRuns(now)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={
          <>
            <SampleBadge />
            <span>Strategy lab</span>
          </>
        }
        title="Strategies"
        description="Write entry and exit rules, backtest them on point-in-time NSE history with Indian costs, then paper trade the same rules. Runs go to a queue of Python workers."
        actions={
          <>
            <ImportDialog />
            <Button size="lg" asChild>
              <Link href="/lab/new">
                <Plus /> New strategy
              </Link>
            </Button>
          </>
        }
      />

      <UsageStrip />

      <Panel
        title="Your strategies"
        description="Sample runs, Jan 2016 to yesterday · open one for the full report"
        actions={<span className="num text-[11px] text-muted-foreground">{strategies.length} strategies</span>}
      >
        <div className="grid gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-4">
          {strategies.map(({ strategy, summary }) => (
            <StrategyCard key={strategy.id} strategy={strategy} summary={summary} />
          ))}
        </div>
      </Panel>

      <Panel
        title="Recent runs"
        description="Queued → running → done, as the workers report progress"
        actions={<SampleBadge />}
      >
        <RunsTable runs={runs} />
      </Panel>

      <Panel title="Start from a template" description="Each opens the builder prefilled; change anything before you run it">
        <TemplateGallery />
      </Panel>

      <p className="text-[11px] text-muted-foreground">
        Backtest results are hypothetical and use sample data here. They are not a promise of future returns, and nothing in the lab is investment advice.
      </p>
    </div>
  )
}
