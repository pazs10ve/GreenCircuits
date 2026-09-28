"use client"

import { useState } from "react"
import type { Fundamentals, PeriodRow } from "@greencircuits/market/fundamentals"
import { formatNumber } from "@greencircuits/market/format"
import { useMarket } from "@/lib/stream/market-context"
import { Segmented } from "@/components/market/segmented"
import { Move } from "@/components/parts/move"
import { cn } from "@/lib/utils"

type Period = "annual" | "quarterly"

function crore(v: number): string {
  return v >= 1e5 ? `₹${formatNumber(v / 1e5, 2)} L Cr` : `₹${formatNumber(v, 0)} Cr`
}

const percent = (v: number) => `${formatNumber(v, 1)}%`

interface Chart {
  title: string
  values: number[]
  labels: string[]
  format: (v: number) => string
  /** Amounts as bars from zero; rates as a line, whose range is what matters. */
  kind: "bars" | "line"
  /** Only yearly figures exist for it, whichever view is picked. */
  yearly?: boolean
}

/**
 * The company's results as small charts, a year or a quarter at a time: what
 * it sold, what it made at each stage, per share, its margin and the cash it
 * brought in. The full statement is one click away.
 */
export function Financials({ f }: { f: Fundamentals }) {
  const [period, setPeriod] = useState<Period>("annual")
  const rows: PeriodRow[] = period === "annual" ? f.annual : f.quarters
  const labels = rows.map((r) => r.label)
  const charts: Chart[] = [
    { title: "Revenue", values: rows.map((r) => r.revenue), labels, format: crore, kind: "bars" },
    { title: "Operating profit", values: rows.map((r) => r.operatingProfit), labels, format: crore, kind: "bars" },
    { title: "Net profit", values: rows.map((r) => r.netProfit), labels, format: crore, kind: "bars" },
    { title: "Earnings per share", values: rows.map((r) => r.eps), labels, format: (v) => `₹${formatNumber(v, 2)}`, kind: "bars" },
    { title: "Operating margin", values: rows.map((r) => r.opm), labels, format: percent, kind: "line" },
    // Cash flow comes a year at a time; a quarterly view shows the net margin in its place.
    period === "annual" && f.cashFlow.length > 1
      ? { title: "Cash from operations", values: f.cashFlow.map((c) => c.operating), labels: f.cashFlow.map((c) => c.label), format: crore, kind: "bars", yearly: true }
      : { title: "Net margin", values: rows.map((r) => (r.revenue ? (r.netProfit / r.revenue) * 100 : 0)), labels, format: percent, kind: "line" },
  ]

  return (
    <div>
      <Segmented
        className="mb-4"
        aria-label="Period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: "annual", label: "Yearly" },
          { value: "quarterly", label: "Quarterly" },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {charts.map((c) => {
          const last = c.values.at(-1)!
          const prev = c.values.at(period === "annual" || c.yearly ? -2 : -5)
          // A rate moves in points; an amount by a share, which means nothing across a loss.
          const change = prev == null ? null : c.kind === "line" ? last - prev : prev > 0 && last > 0 ? (last / prev - 1) * 100 : null
          return (
            <figure key={c.title} className="min-w-0 rounded-panel bg-panel p-4">
              <figcaption className="flex items-center justify-between gap-2 text-xs text-ink-3">
                {c.title}
                {change != null && (
                  <span title={period === "annual" || c.yearly ? "On last year" : "On a year ago"}>
                    <Move value={change} digits={1} unit={c.kind === "line" ? "pts" : "%"} />
                  </span>
                )}
              </figcaption>
              <p className={cn("figure mt-2 text-[1.5rem] leading-none", last < 0 && "text-down")}>{c.format(last)}</p>
              <Small values={c.values} labels={c.labels} kind={c.kind} format={c.format} />
            </figure>
          )
        })}
      </div>
      <details className="group mt-5">
        <summary className="w-fit cursor-pointer list-none text-[13px] font-semibold text-ink-2 hover:text-ink">
          <span className="group-open:hidden">Show the full profit and loss statement</span>
          <span className="hidden group-open:inline">Hide the statement</span>
        </summary>
        <Statement rows={rows} />
      </details>
    </div>
  )
}

/** One small chart: bars from a zero line (below it for a loss), or a line through the points. The latest is in ink. */
function Small({ values, labels, kind, format }: { values: number[]; labels: string[]; kind: "bars" | "line"; format: (v: number) => string }) {
  const h = 96
  const lo = kind === "bars" ? Math.min(0, ...values) : Math.min(...values)
  const hi = kind === "bars" ? Math.max(0, ...values) : Math.max(...values)
  const pad = kind === "line" ? Math.max((hi - lo) * 0.2, Math.abs(hi) * 0.02, 0.5) : 0
  const bottom = lo - pad
  const span = Math.max(1e-9, hi + pad - bottom)
  const y = (v: number) => h - ((v - bottom) / span) * h
  const zero = y(0)
  const step = 100 / values.length
  return (
    <div className="mt-4">
      {/* Stretched to the column; the dots are drawn over it, so they stay round. */}
      <div className="relative h-24" role="img" aria-label={labels.map((l, i) => `${l}: ${format(values[i]!)}`).join(", ")}>
        <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="absolute inset-0 block h-full w-full overflow-visible" aria-hidden="true">
          {kind === "bars" ? (
            values.map((v, i) => {
              const top = Math.min(y(v), zero)
              const height = Math.max(Math.abs(zero - y(v)), 1.5)
              const last = i === values.length - 1
              return (
                <rect key={labels[i]} x={i * step + step * 0.14} width={step * 0.72} y={v >= 0 ? top : zero} height={height} rx={0.8} className={v < 0 ? "fill-down/70" : last ? "fill-ink" : "fill-rule-strong"}>
                  <title>{`${labels[i]}: ${format(v)}`}</title>
                </rect>
              )
            })
          ) : (
            <polyline
              points={values.map((v, i) => `${i * step + step / 2},${y(v)}`).join(" ")}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth={1.5}
              strokeLinejoin="round"
              className="stroke-ink-3"
            />
          )}
          {kind === "bars" && <line x1={0} x2={100} y1={zero} y2={zero} vectorEffect="non-scaling-stroke" strokeWidth={1} className="stroke-ink-3/60" />}
        </svg>
        {kind === "line" &&
          values.map((v, i) => (
            <span
              key={labels[i]}
              title={`${labels[i]}: ${format(v)}`}
              className={cn("absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full", i === values.length - 1 ? "bg-ink" : "bg-ink-3")}
              style={{ left: `${i * step + step / 2}%`, top: `${(y(v) / h) * 100}%` }}
            />
          ))}
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
          <tr className="border-b border-rule-strong">
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
