"use client"

import { useMemo, useState } from "react"
import type { Point } from "@greencircuits/market/types"
import { formatINR, formatNumber } from "@greencircuits/market/format"
import { xirr } from "@greencircuits/market/research/metrics"
import { Figure, toneOf } from "@/components/editorial/figures"
import { Segmented } from "@/components/market/segmented"
import { Move } from "@/components/parts/move"
import { LineChart } from "@/components/viz/line-chart"

const AMOUNTS = [1000, 5000, 10_000, 25_000] as const
const YEAR = 365.25 * 86400

/** The first NAV of each month from `start`: the day a monthly SIP buys. */
function firstOfMonths(history: Point[], start: number): Point[] {
  const out: Point[] = []
  let month = ""
  for (const p of history) {
    if (p.time < start) continue
    const d = new Date(p.time * 1000)
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`
    if (key !== month) {
      month = key
      out.push(p)
    }
  }
  return out
}

/** What a monthly SIP in the fund would have become: put in, worth now, and the return a year (XIRR). */
export function SipCalculator({ history }: { history: Point[] }) {
  const last = history.at(-1)
  const spanYears = last && history[0] ? (last.time - history[0].time) / YEAR : 0
  const choices = ([1, 3, 5, 10] as const).filter((y) => y <= spanYears + 0.05)
  const [amount, setAmount] = useState<(typeof AMOUNTS)[number]>(10_000)
  const [years, setYears] = useState<number>(choices.includes(5) ? 5 : (choices.at(-1) ?? 1))

  const result = useMemo(() => {
    if (!last) return null
    const buys = firstOfMonths(history, last.time - years * YEAR)
    let units = 0
    const flows: { date: number; amount: number }[] = []
    const path: { t: number; value: number; invested: number }[] = []
    let b = 0
    for (const p of history) {
      if (b < buys.length && p.time >= buys[b]!.time) {
        units += amount / buys[b]!.value
        flows.push({ date: buys[b]!.time * 1000, amount: -amount })
        b++
      }
      if (b > 0) path.push({ t: p.time, value: units * p.value, invested: b * amount })
    }
    const worth = units * last.value
    const invested = buys.length * amount
    return { worth, invested, irr: xirr([...flows, { date: last.time * 1000, amount: worth }]), months: buys.length, path }
  }, [history, last, amount, years])

  if (!result || choices.length === 0) return <p className="text-sm text-ink-3">The fund is too new for a year of SIPs.</p>
  const gain = result.worth - result.invested

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ink-3">Each month</span>
          <Segmented value={String(amount)} onChange={(v) => setAmount(Number(v) as (typeof AMOUNTS)[number])} options={AMOUNTS.map((a) => ({ value: String(a), label: `₹${formatNumber(a, 0)}` }))} aria-label="Amount each month" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ink-3">For</span>
          <Segmented value={String(years)} onChange={(v) => setYears(Number(v))} options={choices.map((y) => ({ value: String(y), label: `${y} year${y === 1 ? "" : "s"}` }))} aria-label="How long" />
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Figure variant="panel" size="sm" label="Put in" value={formatINR(result.invested, 0)} hint={`${result.months} × ₹${formatNumber(amount, 0)}`} />
        <Figure variant="panel" size="sm" label="Worth now" value={formatINR(result.worth, 0)} delta={<Move value={(gain / result.invested) * 100} digits={1} />} />
        <Figure
          variant="panel"
          size="sm"
          label="A year, XIRR"
          value={`${formatNumber(result.irr, 1)}%`}
          tone={toneOf(result.irr)}
          hint="On the money as it went in"
          className="col-span-2 sm:col-span-1"
        />
      </dl>
      <LineChart
        className="mt-5"
        height={200}
        series={[
          { id: "value", points: result.path.map((p) => ({ t: p.t, v: p.value })), color: "var(--ink)", label: "Worth", area: true },
          { id: "invested", points: result.path.map((p) => ({ t: p.t, v: p.invested })), color: "var(--ink-3)", label: "Put in", dashed: true },
        ]}
        yFormat={(v) => `₹${formatNumber(v / 1e5, 1)}L`}
        ariaLabel="What the SIP was worth each day, against what had been put in"
      />
    </div>
  )
}
