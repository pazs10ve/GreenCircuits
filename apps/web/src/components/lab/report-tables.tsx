"use client"

import { useState } from "react"
import { heat } from "@/components/parts/heat"
import type { RunInfo, RunResult, RunTrade } from "@greencircuits/contracts/lab"
import { getInstrument } from "@greencircuits/market/catalog"
import { formatNumber, formatPrice } from "@greencircuits/market/format"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { money, pct } from "@/lib/lab/describe"
import { EXIT_REASONS, monthGrid, numberRows } from "@/lib/lab/report"
import { cn } from "@/lib/utils"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** The strategy against its alternative (and the market), with the better figure set in bold. */
export function NumbersTable({ run, result }: { run: RunInfo; result: RunResult }) {
  const { columns, rows } = numberRows(run, result)
  return (
    <table className="w-full max-w-3xl text-[0.9375rem]">
      <thead>
        <tr className="border-b border-rule-strong text-left">
          <th scope="col" className="pb-2 font-normal">
            <span className="sr-only">Measure</span>
          </th>
          {columns.map((c, i) => (
            <th key={c} scope="col" className={cn("pb-2 pl-3 text-right align-bottom text-sm font-semibold sm:pl-4", i === 0 ? "text-ink" : i === 1 ? "text-accent-ink" : "text-ink-2")}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-rule">
            <th scope="row" className="py-2.5 pr-3 text-left font-normal text-ink-2">
              {r.hint ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="cursor-help underline decoration-ink-3/50 decoration-dotted underline-offset-4">
                      {r.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64 text-xs leading-relaxed">{r.hint}</TooltipContent>
                </Tooltip>
              ) : (
                r.label
              )}
            </th>
            {r.values.map((v, i) => (
              <td key={i} className={cn("num py-2.5 pl-3 text-right whitespace-nowrap sm:pl-4", r.better === i ? "font-semibold text-ink" : "text-ink-2")}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The two parts of the period side by side: return a year for the strategy and its alternative. */
export function HeldOutTable({ result, labels }: { result: RunResult; labels: [string, string] }) {
  const m = result.metrics
  const a = m.alternative
  const parts = [
    { label: "First 70%", s: m.in_sample.cagr, a: a.in_sample.cagr },
    { label: "Held-out 30%", s: m.out_of_sample.cagr, a: a.out_of_sample.cagr },
  ]
  return (
    <table className="w-full max-w-xl text-[0.9375rem]">
      <thead>
        <tr className="border-b border-rule-strong text-left">
          <th scope="col" className="pb-2 text-sm font-normal text-ink-3">
            Return a year
          </th>
          <th scope="col" className="pb-2 pl-4 text-right text-sm font-semibold">
            {labels[0]}
          </th>
          <th scope="col" className="pb-2 pl-4 text-right text-sm font-semibold text-accent-ink">
            {labels[1]}
          </th>
          <th scope="col" className="pb-2 pl-4 text-right text-sm font-normal text-ink-2">
            Difference
          </th>
        </tr>
      </thead>
      <tbody>
        {parts.map((p) => {
          const diff = p.s - p.a
          return (
            <tr key={p.label} className="border-b border-rule">
              <th scope="row" className="py-2.5 pr-3 text-left font-normal text-ink-2">
                {p.label}
              </th>
              <td className="num py-2.5 pl-4 text-right">{pct(p.s)}</td>
              <td className="num py-2.5 pl-4 text-right">{pct(p.a)}</td>
              <td className={cn("num py-2.5 pl-4 text-right font-medium", diff > 0.0025 ? "text-up" : diff < -0.0025 ? "text-down" : "text-ink-2")}>
                {pct(diff, { signed: true })}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** A month's colours: the site's heat scale, full at an 8% month. */
const shade = (r: number) => heat(r * 100, 8)

/** Monthly returns, a year to a row, coloured by size. */
export function MonthlyGrid({ monthly }: { monthly: Record<string, number> }) {
  const grid = monthGrid(monthly)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-separate border-spacing-[2px] text-[0.8125rem]">
        <thead>
          <tr>
            <th scope="col" className="pb-1 text-left font-normal text-ink-3">
              <span className="sr-only">Year</span>
            </th>
            {MONTHS.map((m) => (
              <th key={m} scope="col" className="pb-1 text-center font-normal text-ink-3">
                {m}
              </th>
            ))}
            <th scope="col" className="pb-1 pl-2 text-right font-semibold text-ink-2">
              Year
            </th>
          </tr>
        </thead>
        <tbody>
          {grid.map((row) => (
            <tr key={row.year}>
              <th scope="row" className="pr-2 text-left font-medium text-ink-2">
                {row.year}
              </th>
              {row.months.map((r, i) => (
                <td key={i} className="num h-8 rounded-[4px] text-center font-medium" style={r == null ? undefined : { background: shade(r).bg, color: shade(r).fg }}>
                  {r == null ? "" : formatNumber(r * 100, 1)}
                </td>
              ))}
              <td className={cn("num pl-2 text-right font-semibold", row.total >= 0 ? "text-up" : "text-down")}>{pct(row.total, { signed: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-3">Per cent, time-weighted, so new money doesn&apos;t count as a gain.</p>
    </div>
  )
}

const day = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso))

/** Every round trip: what was bought, when it was sold and why, and how it did after charges. */
export function TradesTable({ trades }: { trades: RunTrade[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? trades : trades.slice(0, 20)
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-[0.875rem]">
          <thead>
            <tr className="border-b border-rule-strong text-left text-xs text-ink-3">
              <th scope="col" className="pb-2 font-normal">
                <span className="sr-only">Instrument</span>
              </th>
              <th scope="col" className="pb-2 pl-4 font-normal">
                Bought
              </th>
              <th scope="col" className="pb-2 pl-4 text-right font-normal">
                At
              </th>
              <th scope="col" className="pb-2 pl-4 font-normal">
                Sold
              </th>
              <th scope="col" className="pb-2 pl-4 text-right font-normal">
                At
              </th>
              <th scope="col" className="pb-2 pl-4 font-normal">
                Why
              </th>
              <th scope="col" className="pb-2 pl-4 text-right font-normal">
                Return
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const inst = getInstrument(t.instrument_id)
              const cost = t.entry_price * t.quantity
              const r = t.pnl != null && cost > 0 ? t.pnl / cost : null
              return (
                <tr key={t.trade_no} className="border-b border-rule">
                  <td className="py-2 font-medium">{inst?.name ?? t.instrument_id}</td>
                  <td className="num py-2 pl-4 whitespace-nowrap text-ink-2">{day(t.entry_at)}</td>
                  <td className="num py-2 pl-4 text-right">{formatPrice(t.entry_price, inst?.tick)}</td>
                  <td className="num py-2 pl-4 whitespace-nowrap text-ink-2">{t.exit_at ? day(t.exit_at) : "–"}</td>
                  <td className="num py-2 pl-4 text-right">{t.exit_price != null ? formatPrice(t.exit_price, inst?.tick) : "–"}</td>
                  <td className="py-2 pl-4 text-ink-2">{t.exit_reason ? EXIT_REASONS[t.exit_reason] : "–"}</td>
                  <td className={cn("num py-2 pl-4 text-right font-medium", r == null ? "" : r >= 0 ? "text-up" : "text-down")}>
                    {r == null ? "–" : pct(r, { signed: true })}
                    {t.pnl != null && <span className="ml-2 font-normal text-ink-3">{money(t.pnl)}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {trades.length > 20 && (
        <button type="button" className="link mt-3 text-sm font-medium" onClick={() => setAll((v) => !v)}>
          {all ? "Show the first 20" : `Show all ${trades.length} trades`}
        </button>
      )}
    </div>
  )
}
