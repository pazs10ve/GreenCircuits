"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Plus, X } from "lucide-react"
import type { Tone } from "@greencircuits/market/research/company"
import { Section } from "@/components/editorial/section"
import { InstrumentPicker } from "@/components/market/instrument-picker"
import { LivePrice } from "@/components/market/price"
import { Segmented } from "@/components/market/segmented"
import { Move } from "@/components/parts/move"
import { PILLAR_NAMES, ScoreDots, ScoreLegend } from "@/components/parts/score-dots"
import { SERIES } from "@/components/parts/series"
import { Tag } from "@/components/parts/tag"
import { Skeleton } from "@/components/ui/skeleton"
import { LineChart, type ChartSeries, type ScrubPoint } from "@/components/viz/line-chart"
import { getInstrument, hrefOf } from "@greencircuits/market/catalog"
import { formatNumber } from "@greencircuits/market/format"
import { dailyCandles } from "@greencircuits/market/history"
import type { Candle, Instrument } from "@greencircuits/market/types"
import { useDailyBarsOf } from "@/lib/data/client"
import { useMarket } from "@/lib/stream/market-context"
import { cn } from "@/lib/utils"
import { MAX_COMPARED } from "./limits"

/** Five years of days and a few more, fetched once; every range and every return in the table comes out of them. */
const HISTORY = 1300

type Range = "1M" | "6M" | "1Y" | "3Y" | "5Y"
const RANGES: { id: Range; sessions: number; phrase: string; ago: string }[] = [
  { id: "1M", sessions: 22, phrase: "the past month", ago: "a month ago" },
  { id: "6M", sessions: 126, phrase: "the past six months", ago: "six months ago" },
  { id: "1Y", sessions: 250, phrase: "the past year", ago: "a year ago" },
  { id: "3Y", sessions: 750, phrase: "the past three years", ago: "three years ago" },
  { id: "5Y", sessions: 1250, phrase: "the past five years", ago: "five years ago" },
]

/** A company's figures from its results, for the numbers table. */
export interface CompareFacts {
  pe: number | null
  roe: number | null
  growth: number | null
  divYield: number | null
}

/** A label short enough for the end of a line: a stock's symbol, or an index's or commodity's name. */
function labelOf(inst: Instrument): string {
  if (inst.kind === "EQUITY" || inst.kind === "ETF" || inst.kind === "REIT" || inst.kind === "INVIT") return inst.symbol
  return inst.name.length <= 16 ? inst.name : inst.symbol
}

const dateText = (t: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(t * 1000)

function change(bars: Candle[], sessions: number, annual: boolean): number | null {
  if (bars.length <= sessions) return null
  const r = bars.at(-1)!.close / bars.at(-1 - sessions)!.close
  return annual ? (r ** (250 / sessions) - 1) * 100 : (r - 1) * 100
}

/** Annualised volatility and the worst fall from a peak, over the last n sessions. */
function risk(bars: Candle[], sessions: number): { vol: number | null; worst: number | null } {
  const slice = bars.slice(-sessions - 1)
  if (slice.length < 20) return { vol: null, worst: null }
  const rets = slice.slice(1).map((b, i) => Math.log(b.close / slice[i]!.close))
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length
  const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1))
  let peak = 0
  let worst = 0
  for (const b of slice) {
    peak = Math.max(peak, b.close)
    worst = Math.min(worst, b.close / peak - 1)
  }
  return { vol: sd * Math.sqrt(250) * 100, worst: worst * 100 }
}

interface Row {
  inst: Instrument
  color: string
  returns: Record<Range, number | null>
  vol: number | null
  worst: number | null
}

/** One line of the numbers table: a measure, how to read it, and each instrument's value. */
interface Measure {
  label: string
  better: "high" | "low"
  /** Returns are moves, as chips; the rest are amounts, as bars. */
  kind: "move" | "amount"
  values: (number | null)[]
  format?: (v: number) => string
}

/**
 * Several instruments side by side: each a slot across the top, their paths
 * from the same ₹100 on one chart, their scorecards when they are companies,
 * and the numbers with the best of each marked. The list lives in the
 * address (?s=INFY,TCS), so a comparison can be kept or shared.
 */
export function CompareView({ initial, scores, facts }: { initial: number[]; scores: Record<number, Tone[]>; facts: Record<number, CompareFacts> }) {
  const router = useRouter()
  const { mode } = useMarket()
  const [ids, setIds] = useState(initial)
  const [range, setRange] = useState<Range>("1Y")
  const [scrub, setScrub] = useState<ScrubPoint | null>(null)
  const live = useDailyBarsOf(ids, HISTORY)
  const spec = RANGES.find((r) => r.id === range)!

  const update = (next: number[]) => {
    setIds(next)
    setScrub(null)
    const symbols = next.flatMap((id) => getInstrument(id)?.symbol ?? [])
    router.replace(symbols.length ? `/compare?s=${symbols.map(encodeURIComponent).join(",")}` : "/compare?s=", { scroll: false })
  }

  const histories = useMemo(() => {
    const out = new Map<number, Candle[]>()
    for (const id of ids) {
      const inst = getInstrument(id)
      const bars = mode === "live" ? live?.get(id) : inst && dailyCandles(inst, HISTORY)
      if (bars?.length) out.set(id, bars)
    }
    return out
  }, [ids, mode, live])
  const loading = mode === "live" && ids.length > 0 && !live
  const colorOf = (id: number) => SERIES[ids.indexOf(id) % SERIES.length]!

  const series = useMemo<ChartSeries[]>(
    () =>
      ids.flatMap((id, k) => {
        const bars = histories.get(id)
        const inst = getInstrument(id)
        if (!bars || !inst) return []
        const slice = bars.slice(-spec.sessions - 1)
        const base = slice[0]!.close
        const points = slice.map((b) => ({ t: b.time, v: (b.close / base) * 100 }))
        return [{ id: String(id), points, color: SERIES[k % SERIES.length]!, width: 2, label: `₹${formatNumber(points.at(-1)!.v, 0)}` }]
      }),
    [ids, histories, spec.sessions],
  )

  const rows = useMemo<Row[]>(
    () =>
      ids.flatMap((id, k) => {
        const inst = getInstrument(id)
        const bars = histories.get(id)
        if (!inst || !bars) return []
        const returns = Object.fromEntries(RANGES.map((r) => [r.id, change(bars, r.sessions, r.sessions > 250)])) as Record<Range, number | null>
        return [{ inst, color: SERIES[k % SERIES.length]!, returns, ...risk(bars, spec.sessions) }]
      }),
    [ids, histories, spec.sessions],
  )

  const companies = rows.filter((r) => scores[r.inst.id])
  const measures: Measure[] = [
    ...RANGES.map<Measure>((r) => ({ label: r.sessions > 250 ? `${r.id}, a year` : r.id, better: "high", kind: "move", values: rows.map((x) => x.returns[r.id]) })),
    { label: "Volatility", better: "low", kind: "amount", values: rows.map((x) => x.vol), format: (v) => `${formatNumber(v, 0)}%` },
    { label: "Worst fall", better: "high", kind: "move", values: rows.map((x) => x.worst) },
  ]
  if (companies.length > 0) {
    const fact = (key: keyof CompareFacts) => rows.map((x) => facts[x.inst.id]?.[key] ?? null)
    measures.push(
      { label: "P/E", better: "low", kind: "amount", values: fact("pe"), format: (v) => `${formatNumber(v, 1)}×` },
      { label: "Return on equity", better: "high", kind: "amount", values: fact("roe"), format: (v) => `${formatNumber(v, 0)}%` },
      { label: "Profit growth, 3 years", better: "high", kind: "amount", values: fact("growth"), format: (v) => `${formatNumber(v, 1)}%` },
      { label: "Dividend yield", better: "high", kind: "amount", values: fact("divYield"), format: (v) => `${formatNumber(v, 1)}%` },
    )
  }
  const at = scrub ?? (series[0] ? { t: series[0].points.at(-1)!.t, values: series.map((s) => s.points.at(-1)?.v) } : null)

  return (
    <div className="mt-5 space-y-5">
      <ul aria-label="Compared" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ids.map((id) => {
          const inst = getInstrument(id)
          if (!inst) return null
          const row = rows.find((r) => r.inst.id === id)
          return (
            <li key={id} className="flex min-w-0 flex-col gap-2.5 rounded-card border border-rule bg-paper p-3.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(id) }} aria-hidden="true" />
                <Link href={hrefOf(inst)} className="min-w-0 flex-1 truncate text-sm font-semibold decoration-rule-strong underline-offset-4 hover:underline">
                  {inst.name}
                </Link>
                <button
                  type="button"
                  onClick={() => update(ids.filter((x) => x !== id))}
                  aria-label={`Take ${inst.name} off the chart`}
                  className="-m-1 shrink-0 rounded-md p-1 text-ink-3 hover:bg-panel hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <LivePrice id={id} className="figure text-[1.25rem] leading-none" />
                <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
                  {range}
                  <Move value={row?.returns[range] ?? null} digits={1} />
                </span>
              </div>
            </li>
          )
        })}
        {ids.length < MAX_COMPARED && (
          <li className="min-h-[5.25rem]">
            <InstrumentPicker
              exclude={ids}
              align="start"
              onSelect={(inst) => update([...ids, inst.id])}
              trigger={
                <button
                  type="button"
                  className="flex h-full w-full items-center justify-center gap-2 rounded-card border border-dashed border-rule-strong text-sm font-semibold text-ink-2 transition-colors hover:bg-paper hover:text-ink"
                >
                  <Plus className="size-4" /> Add
                </button>
              }
            />
          </li>
        )}
      </ul>

      {ids.length === 0 ? (
        <p className="rounded-card border border-dashed border-rule-strong py-12 text-center text-sm text-ink-2">Add up to {MAX_COMPARED} stocks, indices, commodities or currencies to compare.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-12">
          <Section
            className={companies.length > 0 ? "lg:col-span-8" : "lg:col-span-12"}
            title={`₹100 invested ${spec.ago}`}
            description="Each line starts from the same ₹100, so the gaps between them are the difference in returns. Price changes only: dividends aren't included."
            action={
              <Segmented
                aria-label="Period"
                value={range}
                onChange={(r) => {
                  setRange(r)
                  setScrub(null)
                }}
                options={RANGES.map((r) => r.id)}
              />
            }
          >
            {loading || series.length === 0 ? (
              <Skeleton className="h-[380px]" />
            ) : (
              <figure>
                <figcaption className="mb-2 min-h-5 text-[13px] text-ink-3">
                  {scrub && at ? (
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>{dateText(at.t)}</span>
                      {series.map((s, i) => (
                        <span key={s.id} className="inline-flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                          <span className="num font-semibold text-ink">{at.values[i] != null ? `₹${formatNumber(at.values[i]!, 0)}` : "–"}</span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    `Over ${spec.phrase}. Point at the chart to read a date.`
                  )}
                </figcaption>
                <LineChart
                  key={`${range}-${ids.join(",")}`}
                  series={series}
                  height={380}
                  reference={{ value: 100, label: "₹100" }}
                  yFormat={(v) => `₹${formatNumber(v, 0)}`}
                  onScrub={setScrub}
                  ariaLabel={`${rows.map((r, i) => `${labelOf(r.inst)} ${series[i]?.label ?? ""}`).join(", ")}, from ₹100 ${spec.ago}.`}
                />
              </figure>
            )}
          </Section>
          {companies.length > 0 && (
            <Section
              className="lg:col-span-4"
              title="Scorecard"
              description="Each company's five measures, as on its own page: valuation against its own history, growth, profitability against its sector, debt and ownership."
            >
              <div role="table" aria-label="Scorecards">
                <div role="row" className="grid grid-cols-[minmax(0,1fr)_repeat(5,2.75rem)] items-end pb-2 text-center text-[11px] text-ink-3">
                  <span role="columnheader" />
                  {PILLAR_NAMES.map((p) => (
                    <span key={p} role="columnheader">
                      {p}
                    </span>
                  ))}
                </div>
                {companies.map((r) => (
                  <div key={r.inst.id} role="row" className="grid grid-cols-[minmax(0,1fr)_repeat(5,2.75rem)] items-center border-t border-rule py-2.5">
                    <span role="rowheader" className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" />
                      <span className="truncate">{r.inst.name}</span>
                    </span>
                    {scores[r.inst.id]!.map((t, i) => (
                      <span key={i} role="cell" className="flex justify-center">
                        <ScoreDots tones={[t]} size={12} />
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              <ScoreLegend className="mt-4" />
            </Section>
          )}
          {rows.length > 0 && (
            <Section
              className="lg:col-span-12"
              title="The numbers"
              description={`Three and five years are rates a year. Volatility and the worst fall are over ${spec.phrase}. The company figures are from their results.`}
            >
              <Numbers rows={rows} measures={measures} />
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

/** Each measure as a row and each instrument as a column, with the best of each row marked. */
function Numbers({ rows, measures }: { rows: Row[]; measures: Measure[] }) {
  const template = { gridTemplateColumns: `11rem repeat(${rows.length}, minmax(6.5rem, 1fr))` }
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div role="table" aria-label="The numbers" className="min-w-max lg:min-w-0">
        <div role="row" className="grid gap-x-5 pb-2" style={template}>
          <span role="columnheader" />
          {rows.map((r) => (
            <span key={r.inst.id} role="columnheader" className="flex min-w-0 items-center gap-2 text-[13px] font-semibold">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" />
              <span className="truncate">{labelOf(r.inst)}</span>
            </span>
          ))}
        </div>
        {measures.map((m) => {
          const known = m.values.filter((v): v is number => v != null)
          const best = known.length > 1 ? (m.better === "high" ? Math.max(...known) : Math.min(...known)) : null
          const most = Math.max(...known.map(Math.abs), 1e-9)
          return (
            <div key={m.label} role="row" className="grid items-center gap-x-5 border-t border-rule py-2.5" style={template}>
              <span role="rowheader" className="flex flex-col">
                <span className="text-sm font-medium">{m.label}</span>
                <span className="text-[11px] text-ink-3">{m.better === "low" ? "lower is better" : "higher is better"}</span>
              </span>
              {m.values.map((v, i) => {
                const isBest = v != null && v === best
                return (
                  <span key={rows[i]!.inst.id} role="cell" className="flex min-w-0 flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {v == null ? (
                        <span className="text-sm text-ink-3">–</span>
                      ) : m.kind === "move" ? (
                        <Move value={v} digits={1} size="md" />
                      ) : (
                        <span className={cn("num text-sm", isBest ? "font-bold text-ink" : "text-ink-2")}>{m.format!(v)}</span>
                      )}
                      {isBest && <Tag tone="up">Best</Tag>}
                    </span>
                    {m.kind === "amount" && v != null && (
                      <span className="h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                        <span className={cn("block h-full rounded-full", isBest ? "bg-ink" : "bg-rule-strong")} style={{ width: `${(Math.abs(v) / most) * 100}%` }} />
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
