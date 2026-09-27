import { EQUITIES, INDICES, marketCapCr, membersOf } from "@greencircuits/market/catalog"
import { FY_LABELS, getFundamentals, peersOf, type Fundamentals } from "@greencircuits/market/fundamentals"
import { fiftyTwoWeek, sparkline } from "@greencircuits/market/history"
import { upcomingEvents } from "@greencircuits/market/reference"
import type { Instrument } from "@greencircuits/market/types"
import { formatCrore, formatNumber, formatPct } from "@greencircuits/market/format"
import type { Universe } from "@/lib/data/universe"
import { between, rngFor, roundTo } from "@greencircuits/market/random"
import {
  closeSessionsAgo,
  foRoot,
  lotSize,
  monthlyExpiries,
  type CalendarItem,
  type IndexStatic,
  type IndexValuation,
  type KeyFundamentals,
  type PeerStatic,
  type StockStatic,
} from "./derive"

/**
 * Server-side assembly of what the stock pages need: from the API's universe
 * when the backend runs, otherwise from the demo generators (deterministic per
 * symbol). The client overlays live quotes.
 */

const DAY = 86_400_000

export function directoryStocks(universe: Universe | null): StockStatic[] {
  if (universe) {
    const rows = new Map(universe.instruments.map((r) => [r.id, r]))
    return EQUITIES.flatMap((inst) => {
      const r = rows.get(inst.id)
      return r ? [{ id: inst.id, spark: r.spark, low52: r.low52, high52: r.high52, eps: universe.eps[inst.id] ?? null }] : []
    })
  }
  return EQUITIES.map((inst) => {
    const year = fiftyTwoWeek(inst)
    return {
      id: inst.id,
      spark: sparkline(inst, 30),
      low52: year.low,
      high52: year.high,
      eps: getFundamentals(inst).epsTtm,
    }
  })
}

export function directoryIndices(universe: Universe | null): IndexStatic[] {
  if (universe) {
    const rows = new Map(universe.instruments.map((r) => [r.id, r]))
    return INDICES.flatMap((inst) => {
      const r = rows.get(inst.id)
      return r ? [{ id: inst.id, spark: r.spark, low52: r.low52, high52: r.high52, members: universe.members[inst.id]?.length ?? 0, lot: lotSize(inst) }] : []
    })
  }
  return INDICES.map((inst) => {
    const year = fiftyTwoWeek(inst)
    return {
      id: inst.id,
      spark: sparkline(inst, 30),
      low52: year.low,
      high52: year.high,
      members: membersOf(inst.id).length,
      lot: lotSize(inst),
    }
  })
}

export function keyFundamentals(inst: Instrument, f: Fundamentals): KeyFundamentals {
  return {
    eps: f.epsTtm,
    bookValue: f.bookValue,
    dps: (f.dividendYield / 100) * inst.prevClose,
    roe: f.roe,
    roce: f.roce,
    debtEquity: f.debtEquity,
    faceValue: f.faceValue,
  }
}

/** Aggregate P/E, P/B and yield of an index from its members' sample fundamentals. */
export function indexValuation(indexId: number): IndexValuation | undefined {
  const members = membersOf(indexId)
  if (members.length === 0) return undefined
  let cap = 0
  let profit = 0
  let book = 0
  let dividends = 0
  for (const m of members) {
    const f = getFundamentals(m)
    const mcap = marketCapCr(m, m.prevClose)
    cap += mcap
    profit += f.ttmProfit
    book += f.bookValue * (m.sharesCr ?? 0)
    dividends += (f.dividendYield / 100) * mcap
  }
  return { members: members.length, pe: cap / profit, pb: cap / book, dividendYield: (dividends / cap) * 100 }
}

/** The largest stocks in the same sector, always including the stock itself. */
export function peerRows(inst: Instrument): PeerStatic[] {
  const list = peersOf(inst, 6)
  if (!list.some((p) => p.id === inst.id)) list.push(inst)
  return list.map((p) => {
    const f = getFundamentals(p)
    return { id: p.id, eps: f.epsTtm, bookValue: f.bookValue, roe: f.roe, base1y: closeSessionsAgo(p, 250) }
  })
}

// ------------------------------------------------------------ calendar

const QUARTER = /^Q([1-4]) FY(\d{2})$/

/** Last day of the quarter for "Q1 FY27" (FY27 runs April 2026 to March 2027). */
function quarterEnd(label: string): Date {
  const m = QUARTER.exec(label)
  if (!m) throw new Error(`Unexpected quarter label: ${label}`)
  const q = Number(m[1])
  const fyEnd = 2000 + Number(m[2])
  if (q === 4) return new Date(Date.UTC(fyEnd, 2, 31))
  // Q1 ends in June, Q2 in September, Q3 in December of the previous calendar year.
  return new Date(Date.UTC(fyEnd - 1, q * 3 + 3, 0))
}

function nextQuarter(label: string): string {
  const m = QUARTER.exec(label)
  if (!m) throw new Error(`Unexpected quarter label: ${label}`)
  const q = Number(m[1])
  const fy = Number(m[2])
  return q === 4 ? `Q1 FY${String(fy + 1).padStart(2, "0")}` : `Q${q + 1} FY${m[2]}`
}

function weekday(ms: number): number {
  const d = new Date(ms)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.getTime()
}

function dividendAmount(value: number): number {
  return Math.max(0.1, roundTo(value, value >= 10 ? 0.5 : value >= 1 ? 0.25 : 0.05))
}

/**
 * Upcoming and past corporate events for one stock. Upcoming results and
 * dividends come from the shared events calendar where it has them; the rest
 * is a sample schedule derived from the stock's sample financials.
 */
export function stockCalendar(inst: Instrument, f: Fundamentals, now: Date): { upcoming: CalendarItem[]; past: CalendarItem[] } {
  const rng = rngFor(inst.symbol, 0xca11)
  const items: CalendarItem[] = []

  // Results for the last four reported quarters.
  const q = f.quarters
  for (let i = q.length - 4; i < q.length; i++) {
    const row = q[i]!
    const q4 = row.label.startsWith("Q4")
    const lag = Math.round(between(rng, q4 ? 24 : 14, q4 ? 50 : 38))
    const prior = q[i - 4]
    const yoy = prior ? ` (${formatPct((row.revenue / prior.revenue - 1) * 100, 1)} YoY)` : ""
    items.push({
      date: weekday(quarterEnd(row.label).getTime() + lag * DAY),
      kind: "RESULTS",
      title: `${row.label} results`,
      detail: `Revenue ${formatCrore(row.revenue)}${yoy} · net profit ${formatCrore(row.netProfit)}`,
    })
  }

  // Dividends and the AGM for the latest financial year, plus last year's final dividend.
  const fyLabel = FY_LABELS.at(-1)!
  const fy = 2000 + Number(fyLabel.slice(2))
  const dps = (f.dividendYield / 100) * inst.prevClose
  const interim = inst.sector === "IT" || rng() < 0.35
  const finalShare = interim ? 0.6 : 1
  if (interim) {
    items.push({
      date: weekday(Date.UTC(fy - 1, 9, 15) + Math.round(between(rng, 0, 100)) * DAY),
      kind: "DIVIDEND",
      title: `Interim dividend ${fyLabel}`,
      detail: `₹${formatNumber(dividendAmount(dps * 0.4), 2)} per share · ex-date`,
    })
  }
  const finalDate = weekday(Date.UTC(fy, 5, 5) + Math.round(between(rng, 0, 50)) * DAY)
  items.push({
    date: finalDate,
    kind: "DIVIDEND",
    title: `Final dividend ${fyLabel}`,
    detail: `₹${formatNumber(dividendAmount(dps * finalShare), 2)} per share · ex-date`,
  })
  items.push({
    date: weekday(finalDate + Math.round(between(rng, 7, 21)) * DAY),
    kind: "AGM",
    title: "Annual general meeting",
    detail: `Adopts ${fyLabel} accounts and approves the final dividend`,
  })
  const prevFy = `FY${String(Number(fyLabel.slice(2)) - 1).padStart(2, "0")}`
  items.push({
    date: weekday(Date.UTC(fy - 1, 5, 5) + Math.round(between(rng, 0, 50)) * DAY),
    kind: "DIVIDEND",
    title: `Final dividend ${prevFy}`,
    detail: `₹${formatNumber(dividendAmount(dps * finalShare * 0.9), 2)} per share · ex-date`,
  })

  // What the shared calendar already has for this stock.
  const label = nextQuarter(q.at(-1)!.label)
  const shared = upcomingEvents(now).filter((e) => e.instrumentId === inst.id)
  for (const e of shared) {
    if (e.kind === "RESULTS") {
      items.push({ date: e.date.getTime(), kind: "RESULTS", title: `${label} results`, detail: "Board meeting to approve results" })
    } else if (e.kind === "DIVIDEND") {
      items.push({ date: e.date.getTime(), kind: "DIVIDEND", title: "Ex-dividend", detail: e.detail })
    }
  }
  if (!shared.some((e) => e.kind === "RESULTS")) {
    items.push({
      date: weekday(quarterEnd(label).getTime() + Math.round(between(rng, 14, 38)) * DAY),
      kind: "RESULTS",
      title: `${label} results`,
      detail: "Board meeting to approve results",
      expected: true,
    })
  }

  // The next monthly F&O expiry.
  if (inst.isFo) {
    const expiry = monthlyExpiries(inst, now, 1)[0]
    if (expiry) {
      items.push({
        date: expiry.getTime(),
        kind: "EXPIRY",
        title: "Monthly F&O expiry",
        detail: `${foRoot(inst)} futures and options, 15:30 IST`,
      })
    }
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return {
    upcoming: items.filter((e) => e.date >= today).sort((a, b) => a.date - b.date),
    past: items.filter((e) => e.date < today).sort((a, b) => b.date - a.date),
  }
}
