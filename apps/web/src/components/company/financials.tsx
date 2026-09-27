"use client"

import { useState } from "react"
import type { Fundamentals, PeriodRow } from "@greencircuits/market/fundamentals"
import { formatNumber } from "@greencircuits/market/format"
import { useMarket } from "@/lib/stream/market-context"
import { cn } from "@/lib/utils"

type Period = "annual" | "quarterly"

function crore(v: number): string {
  return v >= 1e5 ? `₹${formatNumber(v / 1e5, 2)} L Cr` : `₹${formatNumber(v, 0)} Cr`
}

/** Revenue, profit and margin as three small charts, with the full statement one click away. */
export function Financials({ f }: { f: Fundamentals }) {
  const [period, setPeriod] = useState<Period>("annual")
  const rows: PeriodRow[] = period === "annual" ? f.annual : f.quarters
  const charts = [
    { title: "Revenue", values: rows.map((r) => r.revenue), format: crore, kind: "bars" as const },
    { title: "Net profit", values: rows.map((r) => r.netProfit), format: crore, kind: "bars" as const },
    { title: "Operating margin", values: rows.map((r) => r.opm), format: (v: number) => `${formatNumber(v, 1)}%`, kind: "dots" as const },
  ]

  return (
    <div>
      <div role="tablist" aria-label="Period" className="mb-6 flex gap-1">
        {(["annual", "quarterly"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={p === period}
            onClick={() => setPeriod(p)}
            className={cn(
              "h-8 rounded-md px-3 text-sm capitalize transition-colors",
              p === period ? "bg-ink text-paper" : "text-ink-2 hover:bg-surface hover:text-ink",
            )}
          >
            {p === "annual" ? "Yearly" : "Quarterly"}
          </button>
        ))}
      </div>
      <div className="grid gap-10 md:grid-cols-3 md:gap-8">
        {charts.map((c) => {
          const last = c.values.at(-1)!
          const prev = c.values.at(period === "annual" ? -2 : -5)!
          const change = c.kind === "dots" ? last - prev : (last / prev - 1) * 100
          return (
            <figure key={c.title}>
              <figcaption className="text-[13px] text-ink-2">{c.title}</figcaption>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="figure text-[1.5rem] leading-none">{c.format(last)}</span>
                <span className={cn("num text-[13px]", change >= 0 ? "text-up" : "text-down")}>
                  {change >= 0 ? "+" : "−"}
                  {formatNumber(Math.abs(change), 1)}
                  {c.kind === "dots" ? " pts" : "%"}
                </span>
                <span className="text-xs text-ink-3">{period === "annual" ? "on last year" : "on a year ago"}</span>
              </p>
              <Bars values={c.values} labels={rows.map((r) => r.label)} kind={c.kind} />
            </figure>
          )
        })}
      </div>
      <details className="group mt-8">
        <summary className="link cursor-pointer list-none text-sm font-medium">
          <span className="group-open:hidden">Show the full profit and loss statement</span>
          <span className="hidden group-open:inline">Hide the statement</span>
        </summary>
        <Statement rows={rows} />
      </details>
    </div>
  )
}

function Bars({ values, labels, kind }: { values: number[]; labels: string[]; kind: "bars" | "dots" }) {
  const max = Math.max(...values)
  const min = kind === "dots" ? Math.min(...values) * 0.85 : 0
  const h = 96
  return (
    <div className="mt-4">
      <div className="flex items-end gap-1.5 border-b border-ink-3/50" style={{ height: h }}>
        {values.map((v, i) => {
          const frac = (v - min) / Math.max(1e-9, max - min)
          const last = i === values.length - 1
          return (
            <div key={labels[i]} className="relative flex h-full flex-1 items-end justify-center" title={`${labels[i]}: ${formatNumber(v, kind === "dots" ? 1 : 0)}`}>
              {kind === "bars" ? (
                <div className={cn("w-full rounded-t-[2px]", last ? "bg-ink" : "bg-ink-3/35")} style={{ height: `${Math.max(3, frac * (h - 6))}px` }} />
              ) : (
                <div className={cn("absolute size-2 rounded-full", last ? "bg-ink" : "bg-ink-3/60")} style={{ bottom: `${Math.max(2, frac * (h - 10))}px` }} />
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
        <span>{labels[0]}</span>
        <span>{labels.at(-1)}</span>
      </div>
    </div>
  )
}

const LINES: { key: keyof PeriodRow; label: string; strong?: boolean }[] = [
  { key: "revenue", label: "Revenue", strong: true },
  { key: "expenses", label: "Expenses" },
  { key: "operatingProfit", label: "Operating profit", strong: true },
  { key: "otherIncome", label: "Other income" },
  { key: "depreciation", label: "Depreciation" },
  { key: "interest", label: "Interest" },
  { key: "pbt", label: "Profit before tax" },
  { key: "tax", label: "Tax" },
  { key: "netProfit", label: "Net profit", strong: true },
  { key: "eps", label: "Earnings per share (₹)" },
]

function Statement({ rows }: { rows: PeriodRow[] }) {
  const { dataset } = useMarket()
  return (
    <div className="scrollbar-thin mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="mb-2 text-left text-xs text-ink-3">
          ₹ crore, except earnings per share. {dataset === "real" ? "From the company's results, via Yahoo Finance." : "Sample figures."}
        </caption>
        <thead>
          <tr className="border-b border-ink">
            <th scope="col" className="py-2 pr-4 text-left font-normal text-ink-3">
              <span className="sr-only">Line item</span>
            </th>
            {rows.map((r) => (
              <th key={r.label} scope="col" className="py-2 pl-4 text-right font-medium">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LINES.map((line) => (
            <tr key={line.key} className="border-b border-rule">
              <th scope="row" className={cn("py-2 pr-4 text-left font-normal", line.strong ? "text-ink" : "text-ink-2")}>
                {line.label}
              </th>
              {rows.map((r) => (
                <td key={r.label} className={cn("num py-2 pl-4 text-right", line.strong ? "font-medium" : "text-ink-2")}>
                  {formatNumber(r[line.key] as number, line.key === "eps" ? 2 : 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
