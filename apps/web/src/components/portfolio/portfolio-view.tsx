"use client"

import Link from "next/link"
import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { EquityChart } from "@/components/charts/equity-chart"
import { DataTable } from "@/components/data/data-table"
import { LivePrice } from "@/components/market/price"
import { SampleBadge } from "@/components/market/source-badge"
import { Stat, toneOf } from "@/components/market/stat"
import { Panel } from "@/components/shell/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useHydrated } from "@/hooks/use-hydrated"
import { getInstrument } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"
import { formatINR, formatNumber, formatPct, formatSigned } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { usePortfolio } from "@/lib/stores/portfolio"
import { cn } from "@/lib/utils"
import { holdingsHistory, portfolioBeta } from "./analytics"
import { ImportDialog } from "./import-dialog"
import { TaxPanel } from "./tax-panel"

interface Row {
  inst: Instrument
  qty: number
  avg: number
  ltp: number
  value: number
  invested: number
  pnl: number
  pnlPct: number
  dayPnl: number
  dayPct: number
  weight: number
}

function Signed({ value, pct }: { value: number; pct?: number }) {
  return (
    <span className={cn(value > 0 ? "text-up" : value < 0 ? "text-down" : "text-muted-foreground")}>
      {formatSigned(value, 0)}
      {pct != null && <span className="ml-1 text-[11px] opacity-80">{formatPct(pct)}</span>}
    </span>
  )
}

export function PortfolioView() {
  const holdings = usePortfolio((s) => s.holdings)
  const source = usePortfolio((s) => s.source)
  const reset = usePortfolio((s) => s.reset)
  const read = useQuoteReader(1000)
  const hydrated = useHydrated()

  const { rows, totals, sectors, beta } = useMemo(() => {
    const base = holdings
      .map((h) => {
        const inst = getInstrument(h.instrumentId)
        if (!inst) return null
        const q = read(h.instrumentId)
        const ltp = q?.ltp ?? inst.prevClose
        const prev = q?.prevClose ?? inst.prevClose
        return {
          inst,
          qty: h.qty,
          avg: h.avgPrice,
          ltp,
          value: h.qty * ltp,
          invested: h.qty * h.avgPrice,
          pnl: h.qty * (ltp - h.avgPrice),
          pnlPct: (ltp / h.avgPrice - 1) * 100,
          dayPnl: h.qty * (ltp - prev),
          dayPct: (ltp / prev - 1) * 100,
          weight: 0,
        }
      })
      .filter((r): r is Row => r != null)
    const value = base.reduce((s, r) => s + r.value, 0)
    const invested = base.reduce((s, r) => s + r.invested, 0)
    const dayPnl = base.reduce((s, r) => s + r.dayPnl, 0)
    base.forEach((r) => (r.weight = value > 0 ? (r.value / value) * 100 : 0))
    const bySector = new Map<string, number>()
    for (const r of base) bySector.set(r.inst.sector ?? "Other", (bySector.get(r.inst.sector ?? "Other") ?? 0) + r.value)
    return {
      rows: base,
      totals: { value, invested, pnl: value - invested, pnlPct: invested > 0 ? (value / invested - 1) * 100 : 0, dayPnl, dayPct: value - dayPnl > 0 ? (dayPnl / (value - dayPnl)) * 100 : 0 },
      sectors: [...bySector.entries()].map(([sector, v]) => ({ sector, value: v, pct: value > 0 ? (v / value) * 100 : 0 })).sort((a, b) => b.value - a.value),
      beta: portfolioBeta(holdings, (id) => read(id)?.ltp ?? getInstrument(id)?.prevClose ?? 0),
    }
  }, [holdings, read])

  const history = useMemo(() => (hydrated ? holdingsHistory(holdings) : null), [holdings, hydrated])
  const top = [...rows].sort((a, b) => b.weight - a.weight)[0]

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "instrument",
        header: "Instrument",
        accessorFn: (r) => r.inst.symbol,
        cell: ({ row: { original: r } }) => (
          <Link href={`/stocks/${r.inst.slug}`} className="block min-w-32">
            <span className="block text-xs font-medium hover:underline">{r.inst.symbol}</span>
            <span className="block max-w-44 truncate text-[11px] text-muted-foreground">{r.inst.sector}</span>
          </Link>
        ),
      },
      { id: "qty", header: "Qty", accessorFn: (r) => r.qty, meta: { align: "right" }, cell: ({ getValue }) => formatNumber(getValue<number>(), 0) },
      { id: "avg", header: "Avg cost", accessorFn: (r) => r.avg, meta: { align: "right" }, cell: ({ getValue }) => formatNumber(getValue<number>(), 2) },
      {
        id: "ltp",
        header: "LTP",
        accessorFn: (r) => r.ltp,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => <LivePrice id={r.inst.id} className="font-medium" />,
      },
      { id: "value", header: "Value", accessorFn: (r) => r.value, meta: { align: "right" }, cell: ({ getValue }) => formatINR(getValue<number>(), 0) },
      {
        id: "pnl",
        header: "P&L",
        accessorFn: (r) => r.pnl,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => <Signed value={r.pnl} pct={r.pnlPct} />,
      },
      {
        id: "day",
        header: "Today",
        accessorFn: (r) => r.dayPnl,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => <Signed value={r.dayPnl} pct={r.dayPct} />,
      },
      {
        id: "weight",
        header: "Weight",
        accessorFn: (r) => r.weight,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => (
          <span className="inline-flex items-center gap-2">
            <span className="hidden h-1 w-12 overflow-hidden rounded-full bg-muted sm:inline-block">
              <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, r.weight * 2.5)}%` }} />
            </span>
            {formatNumber(r.weight, 1)}%
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          {source === "sample" ? "Showing a sample portfolio. Import your broker's holdings CSV to see your own." : "Imported holdings, stored in this browser."}
        </p>
        <div className="flex gap-2">
          {source === "import" && (
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                reset()
                toast("Back to the sample portfolio")
              }}
            >
              <RotateCcw /> Use sample
            </Button>
          )}
          <ImportDialog />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Current value", value: formatINR(totals.value, 0) },
          { label: "Invested", value: formatINR(totals.invested, 0) },
          { label: "Unrealised P&L", value: formatSigned(totals.pnl, 0), hint: formatPct(totals.pnlPct), tone: toneOf(totals.pnl) },
          { label: "Today", value: formatSigned(totals.dayPnl, 0), hint: formatPct(totals.dayPct), tone: toneOf(totals.dayPnl) },
          { label: "Beta vs Nifty", value: formatNumber(beta, 2), hint: beta > 1.05 ? "More volatile than the index" : beta < 0.95 ? "Less volatile than the index" : "Moves with the index" },
          { label: "Holdings", value: String(rows.length), hint: `${sectors.length} sectors` },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-3">
            <Stat label={s.label} value={s.value} hint={s.hint} tone={s.tone} size="lg" className="space-y-1.5" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="If you had held these for a year"
          description="Today's holdings valued over the last 250 sessions, against the Nifty 50"
          actions={<SampleBadge />}
          bodyClassName="px-1 py-2"
        >
          {history ? (
            <EquityChart equity={history.equity} benchmark={history.benchmark} drawdown={history.drawdown} height={320} />
          ) : (
            <Skeleton className="mx-3 h-[320px]" />
          )}
        </Panel>
        <Panel title="Allocation" description="By sector, at live prices">
          <ul className="space-y-2.5 p-4">
            {sectors.map((s) => (
              <li key={s.sector} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{s.sector}</span>
                  <span className="num text-muted-foreground">
                    {formatINR(s.value, 0)} · <span className="text-foreground">{formatNumber(s.pct, 1)}%</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/70 transition-[width] duration-700" style={{ width: `${s.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {top && top.weight > 20 && (
            <div className="mx-4 mb-4 flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-[11px]">
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
              <span>
                {top.inst.symbol} is {formatNumber(top.weight, 0)}% of the portfolio. A 10% fall in it would cost you{" "}
                {formatINR(top.value * 0.1, 0)}.
              </span>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Holdings" description="Live prices; P&L before charges and taxes">
        <DataTable columns={columns} data={rows} getRowId={(r) => String(r.inst.id)} initialSorting={[{ id: "value", desc: true }]} />
      </Panel>

      <TaxPanel rows={rows.map((r) => ({ symbol: r.inst.symbol, pnl: r.pnl }))} />
    </div>
  )
}
