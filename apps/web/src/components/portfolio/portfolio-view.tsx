"use client"

import Link from "next/link"
import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { EquityChart } from "@/components/charts/equity-chart"
import { DataTable } from "@/components/data/data-table"
import { Figure, Figures, toneOf } from "@/components/editorial/figures"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { LivePrice } from "@/components/market/price"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useHydrated } from "@/hooks/use-hydrated"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"
import { formatINR, formatNumber, formatPct, formatSigned } from "@greencircuits/market/format"
import { useDailyBarsOf, useUniverse } from "@/lib/data/client"
import { useQuoteReader, useSession } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
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
    <span className={cn("inline-flex flex-col items-end leading-snug", value > 0 ? "text-up" : value < 0 ? "text-down" : "text-ink-2")}>
      <span>{formatSigned(value, 0)}</span>
      {pct != null && <span className="text-[13px] opacity-80">{formatPct(pct)}</span>}
    </span>
  )
}

const lakh = (v: number) => (Math.abs(v) >= 1e5 ? `₹${formatNumber(v / 1e5, 2)} lakh` : formatINR(v, 0))

export function PortfolioView() {
  const holdings = usePortfolio((s) => s.holdings)
  const source = usePortfolio((s) => s.source)
  const reset = usePortfolio((s) => s.reset)
  const read = useQuoteReader(1000)
  const hydrated = useHydrated()
  // In live mode the year of history and the betas come from the API.
  const { mode } = useMarket()
  const { closed } = useSession()
  const { data: universe } = useUniverse()
  const liveBars = useDailyBarsOf(mode === "live" ? [INDEX.NIFTY, ...holdings.map((h) => h.instrumentId)] : [], 250)

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
      beta: portfolioBeta(
        holdings,
        (id) => read(id)?.ltp ?? getInstrument(id)?.prevClose ?? 0,
        (id) => universe?.byId.get(id)?.beta,
      ),
    }
  }, [holdings, read, universe])

  const history = useMemo(() => {
    if (!hydrated) return null
    if (mode === "live") return liveBars ? holdingsHistory(holdings, (id) => liveBars.get(id)) : null
    return holdingsHistory(holdings)
  }, [holdings, hydrated, mode, liveBars])
  const top = [...rows].sort((a, b) => b.weight - a.weight)[0]

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "instrument",
        header: "Company",
        accessorFn: (r) => r.inst.name,
        meta: { sticky: true },
        cell: ({ row: { original: r } }) => (
          <Link href={`/stocks/${r.inst.slug}`} className="group block min-w-44 leading-snug">
            <span className="block max-w-56 truncate font-medium text-ink group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{r.inst.name}</span>
            <span className="block max-w-56 truncate text-[13px] text-ink-3">{r.inst.sector}</span>
          </Link>
        ),
      },
      { id: "qty", header: "Shares", accessorFn: (r) => r.qty, meta: { align: "right" }, cell: ({ getValue }) => formatNumber(getValue<number>(), 0) },
      { id: "avg", header: "Average cost", accessorFn: (r) => r.avg, meta: { align: "right" }, cell: ({ getValue }) => <span className="text-ink-2">{formatNumber(getValue<number>(), 2)}</span> },
      {
        id: "ltp",
        header: "Price",
        accessorFn: (r) => r.ltp,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => <LivePrice id={r.inst.id} />,
      },
      { id: "value", header: "Value", accessorFn: (r) => r.value, meta: { align: "right" }, cell: ({ getValue }) => formatINR(getValue<number>(), 0) },
      {
        id: "pnl",
        header: "Gain or loss",
        accessorFn: (r) => r.pnl,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => <Signed value={r.pnl} pct={r.pnlPct} />,
      },
      {
        id: "day",
        header: "Day",
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
            <span className="hidden h-1 w-12 overflow-hidden rounded-full bg-surface-2 sm:inline-block">
              <span className="block h-full rounded-full bg-ink-3" style={{ width: `${Math.min(100, r.weight * 2.5)}%` }} />
            </span>
            {formatNumber(r.weight, 1)}%
          </span>
        ),
      },
    ],
    [],
  )

  const nifty = read(INDEX.NIFTY)?.changePct
  const when = closed ?? "today"
  const against =
    nifty == null
      ? ""
      : Math.abs(totals.dayPct - nifty) < 0.05
        ? ", in line with the Nifty 50"
        : `, ${formatNumber(Math.abs(totals.dayPct - nifty), 1)} points ${totals.dayPct > nifty ? "better" : "worse"} than the Nifty 50`
  const lede = !hydrated
    ? " "
    : rows.length === 0
      ? "No holdings yet. Import them from your broker's holdings file to see them here."
      : `${source === "sample" ? "This sample portfolio" : "Your portfolio"} is worth ${lakh(totals.value)}, ${totals.pnl >= 0 ? "up" : "down"} ${lakh(Math.abs(totals.pnl))} on what it cost. ` +
        `It ${closed ? "ended" : "is"} ${totals.dayPnl >= 0 ? "up" : "down"} ${formatINR(Math.abs(totals.dayPnl), 0)} ${when}${against}.`

  return (
    <div>
      <PageHead
        title="Holdings"
        serif
        lede={lede}
        actions={
          <>
            {source === "import" && (
              <Button
                variant="ghost"
                onClick={() => {
                  reset()
                  toast("Back to the sample portfolio")
                }}
              >
                <RotateCcw /> Use the sample
              </Button>
            )}
            <ImportDialog />
          </>
        }
      />
      <p className="mt-3 text-sm text-ink-3">
        {source === "sample" ? "A sample portfolio. Import your broker's holdings file to see your own." : "Imported from your broker's holdings file."}
      </p>

      <Figures className="mt-10">
        <Figure label="Worth" value={formatINR(totals.value, 0)} />
        <Figure label="Cost" value={formatINR(totals.invested, 0)} />
        <Figure label="Gain or loss" value={formatSigned(totals.pnl, 0)} hint={formatPct(totals.pnlPct)} tone={toneOf(totals.pnl)} />
        <Figure label={closed ? "Last session" : "Today"} value={formatSigned(totals.dayPnl, 0)} hint={formatPct(totals.dayPct)} tone={toneOf(totals.dayPnl)} />
        <Figure label="Beta against the Nifty" value={formatNumber(beta, 2)} hint={beta > 1.05 ? "swings more than the index" : beta < 0.95 ? "swings less than the index" : "moves with the index"} />
        <Figure label="Holdings" value={String(rows.length)} hint={`in ${sectors.length} sectors`} />
      </Figures>

      <div className="mt-16 grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-16 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Section title="If you'd held these for a year" description="What your current holdings would have been worth over the last 250 sessions, against the Nifty 50.">
          {history ? (
            <EquityChart equity={history.equity} benchmark={history.benchmark} drawdown={history.drawdown} height={320} />
          ) : (
            <Skeleton className="h-[320px]" />
          )}
        </Section>
        <Section title="Where your money is" description="By sector, at live prices.">
          <ul className="space-y-3">
            {sectors.map((sec) => (
              <li key={sec.sector} className="space-y-1.5">
                <div className="flex justify-between gap-3 text-sm">
                  <span>{sec.sector}</span>
                  <span className="num text-ink-3">
                    {formatINR(sec.value, 0)} · <span className="text-ink">{formatNumber(sec.pct, 1)}%</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${sec.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {top && top.weight > 20 && (
            <p className="mt-6 border-t border-rule pt-3 text-sm leading-relaxed text-ink-2">
              <span className="font-semibold text-ink">{top.inst.name}</span> is {formatNumber(top.weight, 0)}% of the portfolio. A 10% fall in it would cost
              you {formatINR(top.value * 0.1, 0)}.
            </p>
          )}
        </Section>
      </div>

      <Section className="mt-16" title="Holdings" description="Live prices; gains and losses before charges and tax.">
        <DataTable columns={columns} data={rows} getRowId={(r) => String(r.inst.id)} initialSorting={[{ id: "value", desc: true }]} />
      </Section>

      <Section className="mt-16" title="Capital gains tax, 2026–27" description="Listed shares, under the rules since 23 July 2024.">
        <TaxPanel rows={rows.map((r) => ({ name: r.inst.name, pnl: r.pnl }))} />
      </Section>
    </div>
  )
}
