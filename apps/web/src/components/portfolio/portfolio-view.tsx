"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Eraser, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { DataTable } from "@/components/data/data-table"
import { EmptyNote } from "@/components/editorial/empty-note"
import { Figure, Figures } from "@/components/editorial/figures"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { LivePrice } from "@/components/market/price"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useHydrated } from "@/hooks/use-hydrated"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"
import { formatINR, formatNumber, formatSigned } from "@greencircuits/market/format"
import { useDailyBarsOf, useUniverse } from "@/lib/data/client"
import { useQuoteReader, useSession } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { usePortfolio, type Holding } from "@/lib/stores/portfolio"
import { Meter } from "@/components/parts/meter"
import { Monogram } from "@/components/parts/monogram"
import { Move } from "@/components/parts/move"
import { RAMP, ShareBar } from "@/components/parts/share-bar"
import { Tag } from "@/components/parts/tag"
import { cn } from "@/lib/utils"
import { holdingsHistory, portfolioBeta } from "./analytics"
import { HoldingDialog } from "./holding-dialog"
import { HoldingsChart } from "./holdings-chart"
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
    <span className="inline-flex items-center justify-end gap-2">
      <span className={cn("num", value > 0 ? "text-up" : value < 0 ? "text-down" : "text-ink-2")}>{formatSigned(value, 0)}</span>
      {pct != null && <Move value={pct} />}
    </span>
  )
}

/** Removes a holding at once, with a moment to take it back. */
function removeHolding(inst: Instrument) {
  const { holdings, remove, restore } = usePortfolio.getState()
  const index = holdings.findIndex((h) => h.instrumentId === inst.id)
  const gone = remove(inst.id)
  if (gone) toast(`Removed ${inst.name}`, { action: { label: "Undo", onClick: () => restore(gone, index) } })
}

/** Swaps the whole portfolio (for the sample, or for nothing), with a moment to take it back. */
function swapPortfolio(to: "sample" | "empty") {
  const { holdings, source, reset, clear } = usePortfolio.getState()
  if (to === "sample") reset()
  else clear()
  toast(to === "sample" ? "Back to the sample portfolio" : "Started an empty portfolio", {
    action: { label: "Undo", onClick: () => usePortfolio.setState({ holdings, source }) },
  })
}

export function PortfolioView() {
  const holdings = usePortfolio((s) => s.holdings)
  const source = usePortfolio((s) => s.source)
  // The holding being edited, {} for a new one, null when the dialog is shut.
  const [editing, setEditing] = useState<{ holding?: Holding } | null>(null)
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
          <Link href={`/stocks/${r.inst.slug}`} className="group flex min-w-48 items-center gap-2.5 leading-snug">
            <Monogram text={r.inst.symbol} size={28} />
            <span className="min-w-0">
              <span className="block max-w-56 truncate font-semibold text-ink decoration-rule-strong group-hover:underline group-hover:underline-offset-4">{r.inst.name}</span>
              <span className="block max-w-56 truncate text-xs text-ink-3">{r.inst.sector}</span>
            </span>
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
            <Meter value={r.weight / 40} height={5} className="hidden w-14 sm:block" />
            {formatNumber(r.weight, 1)}%
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Edit or remove</span>,
        enableSorting: false,
        meta: { align: "right" },
        // Always there on a touch screen; on a desktop, with the row under the pointer or in focus.
        cell: ({ row: { original: r } }) => (
          <span className="inline-flex gap-0.5 transition-opacity lg:opacity-0 lg:group-focus-within/row:opacity-100 lg:group-hover/row:opacity-100">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${r.inst.name}`}
              onClick={() => setEditing({ holding: usePortfolio.getState().holdings.find((h) => h.instrumentId === r.inst.id) })}
            >
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.inst.name}`} onClick={() => removeHolding(r.inst)} className="hover:text-down">
              <Trash2 />
            </Button>
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
      ? "No holdings yet"
      : `${rows.length} ${rows.length === 1 ? "holding" : "holdings"} · ${source === "sample" ? "a sample portfolio: add yours, or import your broker's file" : `live prices, ${when}${against}`}`

  const empty = hydrated && rows.length === 0

  return (
    <div>
      <PageHead
        title="Holdings"
        lede={lede}
        actions={
          <>
            <Button size="lg" onClick={() => setEditing({})}>
              <Plus /> Add holding
            </Button>
            <ImportDialog />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" aria-label="More for this portfolio">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {source === "own" && (
                  <DropdownMenuItem onSelect={() => swapPortfolio("sample")}>
                    <RotateCcw /> Use the sample portfolio
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => swapPortfolio("empty")} disabled={source === "own" && holdings.length === 0}>
                  <Eraser /> Start an empty portfolio
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <HoldingDialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)} holding={editing?.holding} />

      {empty ? (
        <EmptyNote
          className="mt-10"
          title="No holdings yet"
          action={
            <>
              <Button onClick={() => setEditing({})}>
                <Plus /> Add a holding
              </Button>
              <ImportDialog />
            </>
          }
        >
          Add the shares you own, or import your broker&apos;s holdings file. Their worth, gains, risk and tax are all worked out from them.
        </EmptyNote>
      ) : (
        <>
          <Figures className="mt-5">
            <Figure label="Worth" value={formatINR(totals.value, 0)} delta={<Move value={totals.dayPct} />} />
            <Figure label="Cost" value={formatINR(totals.invested, 0)} />
            <Figure label="Gain or loss" value={`${totals.pnl >= 0 ? "+" : "−"}${formatINR(Math.abs(totals.pnl), 0)}`} delta={<Move value={totals.pnlPct} />} />
            <Figure label={closed ? "Last session" : "Today"} value={`${totals.dayPnl >= 0 ? "+" : "−"}${formatINR(Math.abs(totals.dayPnl), 0)}`} delta={<Move value={totals.dayPct} />} />
            <Figure label="Beta" value={formatNumber(beta, 2)} hint={beta > 1.05 ? "Swings more than the Nifty" : beta < 0.95 ? "Swings less than the Nifty" : "Moves with the Nifty"} />
            <Figure label="Holdings" value={String(rows.length)} hint={`In ${sectors.length} ${sectors.length === 1 ? "sector" : "sectors"}`} />
          </Figures>

          <Section className="mt-5" title="Holdings" description="Live prices; gains and losses before charges and tax.">
            <DataTable columns={columns} data={rows} getRowId={(r) => String(r.inst.id)} initialSorting={[{ id: "value", desc: true }]} noun="holdings" />
          </Section>

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Section title="If you'd held these for a year" description="What your current holdings would have been worth over the last 250 sessions, against the Nifty 50.">
              {history ? <HoldingsChart equity={history.equity} benchmark={history.benchmark} drawdown={history.drawdown} /> : <Skeleton className="h-[500px]" />}
            </Section>
            <Section title="Where your money is" description="By sector, at live prices.">
              <ShareBar
                height={12}
                label={sectors.map((sec) => `${sec.sector} ${formatNumber(sec.pct, 0)}%`).join(", ")}
                parts={sectors.map((sec, i) => ({ value: sec.value, className: RAMP[Math.min(i, RAMP.length - 1)]! }))}
              />
              <ul className="mt-3 divide-y divide-rule">
                {sectors.map((sec, i) => (
                  <li key={sec.sector} className="grid grid-cols-[0.625rem_minmax(0,1fr)_auto_3rem] items-center gap-2.5 py-2 text-sm">
                    <span className={cn("size-2.5 rounded-[3px]", RAMP[Math.min(i, RAMP.length - 1)])} aria-hidden="true" />
                    <span className="truncate">{sec.sector}</span>
                    <span className="num text-xs text-ink-3">{formatINR(sec.value, 0)}</span>
                    <span className="num text-right font-semibold">{formatNumber(sec.pct, 0)}%</span>
                  </li>
                ))}
              </ul>
              {top && top.weight > 20 && (
                <div className="mt-4">
                  <Tag tone="attn">
                    {top.inst.name} is {formatNumber(top.weight, 0)}%: a 10% fall costs {formatINR(top.value * 0.1, 0)}
                  </Tag>
                </div>
              )}
            </Section>
          </div>

          <Section
            className="mt-5"
            title="Capital gains tax, 2026–27"
            description="Listed shares, under the rules since 23 July 2024. The gains are sample figures; the losses come from the holdings above. An illustration, not tax advice: it leaves out surcharge and the 4% cess, grandfathering for shares bought before 1 February 2018, and intraday or F&O income, which is taxed as business income."
          >
            <TaxPanel rows={rows.map((r) => ({ name: r.inst.name, pnl: r.pnl }))} />
          </Section>
        </>
      )}
    </div>
  )
}
