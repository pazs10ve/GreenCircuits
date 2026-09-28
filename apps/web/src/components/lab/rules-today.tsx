"use client"

import Link from "next/link"
import { useMemo } from "react"
import { conditionSeries, operand, type Series } from "@greencircuits/backtest/simulate"
import type { RunTrade } from "@greencircuits/contracts/lab"
import type { Condition, Operand, StrategyDefinition } from "@greencircuits/contracts/strategy"
import { getInstrument, hrefOf } from "@greencircuits/market/catalog"
import { formatDateIST, formatNumber, formatPrice } from "@greencircuits/market/format"
import { dailyCandles } from "@greencircuits/market/history"
import { istDate } from "@greencircuits/market/session"
import type { Candle } from "@greencircuits/market/types"
import { AlertDialogButton } from "@/components/market/alert-dialog"
import { Monogram } from "@/components/parts/monogram"
import { Result, Tag } from "@/components/parts/tag"
import { Skeleton } from "@/components/ui/skeleton"
import { useNow } from "@/hooks/use-now"
import { useDailyBarsOf } from "@/lib/data/client"
import { OPS, conditionText, operandText } from "@/lib/lab/describe"
import { useMarket } from "@/lib/stream/market-context"
import { cn } from "@/lib/utils"

type Rules = Extract<StrategyDefinition, { type: "rules" }>

/** Enough daily bars for a 250-day high or a 200-day average, with room for RSI's smoothing to settle. */
const SESSIONS = 320
/** Stocks listed; the rest are summed up in a line. */
const SHOWN = 5
/** A test that ended this recently still describes what the rules hold now. */
const RECENT_DAYS = 5

type State = "holding" | "buy" | "none"

interface Row {
  id: number
  state: State
  readings: { c: Condition; left: number; right: number; crossedEarlier: boolean }[]
  since?: string
  at?: number
}

function toSeries(candles: Candle[]): Series {
  return {
    dates: candles.map((c) => c.time),
    open: candles.map((c) => c.open),
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
  }
}

/** What an operand measures, as a label for its value: "14-day RSI", "Price". */
function label(o: Operand): string {
  switch (o.kind) {
    case "price":
      return "Price"
    case "value":
      return ""
    case "rsi":
      return `${o.period}-day RSI`
    case "sma":
      return `${o.period}-day average`
    case "ema":
      return `${o.period}-day exponential average`
    case "high":
      return `${o.period}-day high`
    case "low":
      return `${o.period}-day low`
  }
}

/** An operand's value on the latest close: an RSI reading, a plain number, or a price. */
function value(o: Operand, v: number, rupees: boolean, tick: number): string {
  if (Number.isNaN(v)) return "not known yet"
  if (o.kind === "rsi") return formatNumber(v, 1)
  if (o.kind === "value") return formatNumber(v, Number.isInteger(v) ? 0 : 2)
  return `${rupees ? "₹" : ""}${formatPrice(v, tick)}`
}

/** The selling rules for a position bought at `at`, with the prices they come to. */
function sellWhen(exit: Rules["exit"], at: number, money: (v: number) => string): string[] {
  const out: string[] = []
  if (exit.targetPct != null) out.push(`it reaches ${money(at * (1 + exit.targetPct / 100))}, ${formatNumber(exit.targetPct, 0)}% up`)
  if (exit.stopPct != null) out.push(`it falls to ${money(at * (1 - exit.stopPct / 100))}, ${formatNumber(exit.stopPct, 0)}% down`)
  if (exit.trailPct != null) out.push(`it falls ${formatNumber(exit.trailPct, 0)}% from its highest close since buying`)
  if (exit.maxBars != null) out.push(`${exit.maxBars} trading days have passed`)
  for (const c of exit.when ?? []) out.push(conditionText(c))
  return out
}

/**
 * Where a rules test stands on the latest close. The test says what would
 * have happened; this says what the rules would do next: for each stock,
 * whether its buy rules hold today, with the figures they read, and the
 * positions the test was still holding when it ended.
 */
export function RulesToday({ definition: d, trades, dateTo, className }: { definition: Rules; trades: RunTrade[]; dateTo: string; className?: string }) {
  const { mode } = useMarket()
  const ids = d.universe
  const live = useDailyBarsOf(ids, SESSIONS)
  const now = useNow(60_000)
  const recent = now != null && (Date.parse(istDate(now.getTime())) - Date.parse(dateTo)) / 86_400_000 <= RECENT_DAYS
  const open = useMemo(
    () => new Map(recent ? trades.filter((t) => t.side === "B" && t.exit_reason === "END_OF_TEST").map((t) => [t.instrument_id, t] as const) : []),
    [trades, recent],
  )

  const rows = useMemo<Row[] | null>(() => {
    if (mode === "live" && !live) return null
    return ids.flatMap((id): Row[] => {
      const inst = getInstrument(id)
      const candles = mode === "live" ? live?.get(id) : inst && dailyCandles(inst, SESSIONS)
      if (!inst || !candles || candles.length < 2) return []
      const s = toSeries(candles)
      const readings = d.entry.map((c) => {
        const left = operand(s, c.left).at(-1)!
        const right = operand(s, c.right).at(-1)!
        // A crossing rule fires once; already on the far side means it fired earlier and waits for the next one.
        const crossedEarlier = (c.op === "crosses_below" && left < right) || (c.op === "crosses_above" && left > right)
        return { c, left, right, crossedEarlier }
      })
      const holds = d.entry.map((c) => conditionSeries(s, c).at(-1) ?? false)
      const buy = d.entryLogic === "ANY" ? holds.some(Boolean) : holds.every(Boolean)
      const held = open.get(id)
      if (held) return [{ id, state: "holding", readings, since: held.entry_at, at: held.entry_price }]
      return [{ id, state: buy ? "buy" : "none", readings }]
    })
  }, [mode, live, ids, d.entry, d.entryLogic, open])

  const order: Record<State, number> = { buy: 0, holding: 1, none: 2 }
  const sorted = rows ? [...rows].sort((a, b) => order[a.state] - order[b.state]) : null
  const signals = rows?.filter((r) => r.state === "buy").length ?? 0

  return (
    <aside aria-labelledby="rules-today-title" className={cn("rounded-card border border-rule bg-paper p-4 sm:p-5", className)}>
      <p className="kicker text-brand">Today</p>
      <h2 id="rules-today-title" className="mt-1 text-sm leading-snug font-semibold">
        Would the rules buy now?
      </h2>
      {!sorted ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
            {ids.length > 1
              ? `On the latest close, ${signals === 0 ? "none" : signals} of the ${ids.length} stocks ${signals === 1 ? "meets" : "meet"} the buying rules.`
              : "Read on the latest close; an order would fill at the next day's open."}
          </p>
          <ul className="mt-3 divide-y divide-rule">
            {sorted.slice(0, SHOWN).map((r) => {
              const inst = getInstrument(r.id)!
              const rupees = inst.kind !== "INDEX"
              const money = (v: number) => value({ kind: "price" }, v, rupees, inst.tick)
              const exits = r.at != null ? sellWhen(d.exit, r.at, money) : []
              return (
                <li key={r.id} className="py-3">
                  <p className="flex items-center justify-between gap-3">
                    <Link href={hrefOf(inst)} className="flex min-w-0 items-center gap-2.5 text-sm font-semibold decoration-rule-strong hover:underline hover:underline-offset-4">
                      <Monogram text={inst.symbol} size={26} />
                      <span className="truncate">{inst.name}</span>
                    </Link>
                    {r.state === "buy" ? (
                      <Result>Buy signal</Result>
                    ) : r.state === "holding" ? (
                      <Tag>Holding</Tag>
                    ) : (
                      <span className="shrink-0 text-xs text-ink-3">No signal</span>
                    )}
                  </p>
                  {r.state === "holding" ? (
                    <>
                      <p className="mt-1 text-[13px] leading-snug text-ink-2">
                        Bought on {formatDateIST(Date.parse(r.since!), "medium")} at {money(r.at!)}
                        {exits.length > 0 ? `; sells when ${exits.join(" or ")}.` : "."}
                      </p>
                      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                        {d.exit.targetPct != null && (
                          <AlertDialogButton
                            instrumentId={r.id}
                            preset={{ condition: "PRICE_ABOVE", value: r.at! * (1 + d.exit.targetPct / 100), note: "The selling target from a lab test" }}
                            trigger={
                              <button type="button" className="link font-medium">
                                Alert me at {money(r.at! * (1 + d.exit.targetPct / 100))}
                              </button>
                            }
                          />
                        )}
                        {d.exit.stopPct != null && (
                          <AlertDialogButton
                            instrumentId={r.id}
                            preset={{ condition: "PRICE_BELOW", value: r.at! * (1 - d.exit.stopPct / 100), note: "The stop-loss from a lab test" }}
                            trigger={
                              <button type="button" className="link font-medium">
                                Alert me at {money(r.at! * (1 - d.exit.stopPct / 100))}
                              </button>
                            }
                          />
                        )}
                      </p>
                    </>
                  ) : (
                    r.readings.map(({ c, left, right, crossedEarlier }, i) => (
                      <p key={i} className="mt-1 text-[13px] leading-snug text-ink-2">
                        <span className="text-ink">
                          {label(c.left)} <span className="num">{value(c.left, left, rupees, inst.tick)}</span>
                        </span>
                        ; buys when {operandText(c.left)} {OPS.find((o) => o.op === c.op)!.label}{" "}
                        {c.right.kind === "value" ? value(c.right, right, rupees, inst.tick) : `${operandText(c.right)} (${value(c.right, right, rupees, inst.tick)})`}
                        {crossedEarlier && r.state === "none" && ", which it already has; the rule waits for the next crossing"}.
                      </p>
                    ))
                  )}
                </li>
              )
            })}
          </ul>
          {sorted.length > SHOWN && <p className="mt-2 text-[13px] text-ink-3">And {sorted.length - SHOWN} more with no signal.</p>}
        </>
      )}
    </aside>
  )
}
