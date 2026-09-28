import type { Preferences } from "@greencircuits/contracts/account"
import { money, nameOf, pct, verdictOf } from "@greencircuits/contracts/describe"
import type { RunMetrics } from "@greencircuits/contracts/lab"
import type { StrategyDefinition } from "@greencircuits/contracts/strategy"
import { EQUITIES, getInstrument, hrefOf } from "@greencircuits/market/catalog"
import { formatNumber, formatPrice } from "@greencircuits/market/format"
import type { Instrument, Quote } from "@greencircuits/market/types"
import type { Signal } from "./signals"

/**
 * The personalised feed: a short list of things worth knowing today about the
 * stocks you follow, written as sentences and ranked by how much they matter
 * to how you invest. Pure: the API builds it from Postgres and Valkey, and the
 * browser builds it from its own storage in demo mode.
 */

/** Why a stock is followed, strongest first. */
export type Reason = "holding" | "alert" | "watchlist" | "lab"

export type FeedKind = "portfolio" | "alert" | "signal" | "move" | "high" | "low" | "event" | "test" | "sector"

export interface FeedItem {
  /** Stable for the day, so a list can be keyed on it. */
  id: string
  kind: FeedKind
  /** Unix ms of what it's about. */
  at: number
  instrumentId?: number
  title: string
  detail?: string
  href?: string
  tone: "up" | "down" | "neutral"
  score: number
}

export interface FeedEvent {
  /** IST date, YYYY-MM-DD. */
  date: string
  kind: "RESULTS" | "DIVIDEND" | "EXPIRY" | "IPO" | "HOLIDAY"
  title: string
  detail: string
  instrumentId?: number
}

export interface FeedAlert {
  id: string
  instrumentId: number
  condition: "PRICE_ABOVE" | "PRICE_BELOW" | "CHANGE_ABOVE" | "CHANGE_BELOW"
  value: number
  triggeredAt: number
  triggeredPrice?: number
}

export interface FeedTest {
  runId: string
  name: string
  finishedAt: number
  definition: StrategyDefinition
  metrics: RunMetrics
}

export interface FeedInput {
  now: number
  preferences: Preferences
  interests: Map<number, Reason[]>
  quote: (id: number) => Quote | undefined
  /** The 52-week high and low before today. */
  range: (id: number) => { high: number; low: number } | undefined
  holdings: { instrumentId: number; qty: number }[]
  events: FeedEvent[]
  /** Alerts that went off in the last day. */
  alerts: FeedAlert[]
  /** Tests that finished in the last three days. */
  tests: FeedTest[]
  signals: Signal[]
  /** When the session the quotes are from ended ("today", "on Friday"); absent while it trades. */
  closed?: string | null
}

const DAY = 86_400_000
const MAX_ITEMS = 20

/** A stock's usual daily move, in per cent (one standard deviation). */
export function usualMove(inst: Pick<Instrument, "vol">): number {
  return (inst.vol / Math.sqrt(252)) * 100
}

const hrefById = (id: number) => {
  const inst = getInstrument(id)
  return inst ? hrefOf(inst) : undefined
}

function why(reasons: Reason[] | undefined): string | undefined {
  if (!reasons?.length) return undefined
  if (reasons.includes("holding")) return "You hold it."
  if (reasons.includes("alert")) return "You have an alert on it."
  if (reasons.includes("watchlist")) return "It's on your watchlist."
  return "It's in one of your tests."
}

function when(date: string, now: number): string {
  const today = new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY)
  if (days <= 0) return "today"
  if (days === 1) return "tomorrow"
  return `on ${new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "UTC" }).format(Date.parse(`${date}T00:00:00Z`))}`
}

const CONDITIONS: Record<FeedAlert["condition"], (v: number) => string> = {
  PRICE_ABOVE: (v) => `rose above ₹${formatNumber(v, 2)}`,
  PRICE_BELOW: (v) => `fell below ₹${formatNumber(v, 2)}`,
  CHANGE_ABOVE: (v) => `was up more than ${formatNumber(v, 1)}% on the day`,
  CHANGE_BELOW: (v) => `was down more than ${formatNumber(Math.abs(v), 1)}% on the day`,
}

export function buildFeed(input: FeedInput): FeedItem[] {
  const { now, preferences, interests } = input
  // While the market trades, "is up 2% today"; after the close, "closed up 2% on Friday".
  const past = input.closed != null
  const session = input.closed ?? "today"
  const style = preferences.style
  const weight = (longTerm: number, trading: number) => (style === "long_term" ? longTerm : style === "trading" ? trading : (longTerm + trading) / 2)
  const day = new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
  const items: FeedItem[] = []
  const covered = new Set<number>()

  // Your holdings' day, in rupees.
  let pnl = 0
  let start = 0
  let best: { id: number; pnl: number } | null = null
  for (const h of input.holdings) {
    const q = input.quote(h.instrumentId)
    if (!q) continue
    const change = h.qty * q.change
    pnl += change
    start += h.qty * q.prevClose
    if (!best || Math.abs(change) > Math.abs(best.pnl)) best = { id: h.instrumentId, pnl: change }
  }
  if (start > 0) {
    items.push({
      id: `portfolio:${day}`,
      kind: "portfolio",
      at: now,
      title: `Your holdings ${past ? "ended" : "are"} ${pnl >= 0 ? "up" : "down"} ${money(Math.abs(pnl))} ${session}, ${pct(Math.abs(pnl / start))}.`,
      detail: best
        ? best.pnl >= 0
          ? `${nameOf(best.id, { article: false })} added the most: ${money(best.pnl)}.`
          : `${nameOf(best.id, { article: false })} was the biggest drag: ${money(best.pnl)}.`
        : undefined,
      href: "/portfolio",
      tone: pnl > 0 ? "up" : pnl < 0 ? "down" : "neutral",
      score: 100,
    })
  }

  // Alerts that went off.
  for (const a of input.alerts) {
    items.push({
      id: `alert:${a.id}:${a.triggeredAt}`,
      kind: "alert",
      at: a.triggeredAt,
      instrumentId: a.instrumentId,
      title: `Your alert on ${nameOf(a.instrumentId, { article: false })} went off: it ${CONDITIONS[a.condition](a.value)}.`,
      detail: a.triggeredPrice != null ? `It was at ₹${formatPrice(a.triggeredPrice, getInstrument(a.instrumentId)?.tick)} when it did.` : undefined,
      href: hrefById(a.instrumentId),
      tone: a.condition === "PRICE_ABOVE" || a.condition === "CHANGE_ABOVE" ? "up" : "down",
      score: 90,
    })
  }

  // What your tested rules would buy at the next open.
  for (const s of input.signals) {
    items.push({
      id: `signal:${s.runId}:${s.instrumentId}:${day}`,
      kind: "signal",
      at: now,
      instrumentId: s.instrumentId,
      title: `${nameOf(s.instrumentId, { article: false })} meets the rules of your test “${s.strategy}”.`,
      detail: `On ${past ? "the last close" : "today's price"}, ${s.reason}. The rules would buy at the next open.`,
      href: `/lab/runs/${s.runId}`,
      tone: "neutral",
      score: weight(55, 85),
    })
  }

  // Unusual moves, and 52-week highs and lows, for the stocks you follow.
  for (const [id, reasons] of interests) {
    const inst = getInstrument(id)
    const q = input.quote(id)
    if (!inst || !q) continue
    const range = input.range(id)
    const z = Math.abs(q.changePct) / usualMove(inst)
    const up = q.changePct >= 0
    if (range && inst.kind !== "INDEX" && (q.ltp >= range.high || q.ltp <= range.low)) {
      const high = q.ltp >= range.high
      covered.add(id)
      items.push({
        id: `${high ? "high" : "low"}:${id}:${day}`,
        kind: high ? "high" : "low",
        at: now,
        instrumentId: id,
        title: `${nameOf(id, { article: false })} ${past ? "closed" : "is"} at a 52-week ${high ? "high" : "low"}, ₹${formatPrice(q.ltp, inst.tick)}.`,
        detail: [`${up ? "Up" : "Down"} ${pct(Math.abs(q.changePct / 100))} ${session}.`, why(reasons)].filter(Boolean).join(" "),
        href: hrefById(id),
        tone: high ? "up" : "down",
        score: weight(65, 55) + Math.min(z, 4) * 3,
      })
    } else if (z >= 1.5) {
      covered.add(id)
      items.push({
        id: `move:${id}:${day}`,
        kind: "move",
        at: now,
        instrumentId: id,
        title: `${nameOf(id, { article: false })} ${past ? "closed" : "is"} ${up ? "up" : "down"} ${pct(Math.abs(q.changePct / 100))} ${session}, about ${formatNumber(z, 1)} times its usual daily move.`,
        detail: why(reasons),
        href: hrefById(id),
        tone: up ? "up" : "down",
        score: weight(40, 55) + Math.min(z, 5) * 6,
      })
    }
  }

  // Results and dividends in the coming week.
  for (const e of input.events) {
    if (e.instrumentId == null || !interests.has(e.instrumentId) || (e.kind !== "RESULTS" && e.kind !== "DIVIDEND")) continue
    const days = (Date.parse(`${e.date}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY
    if (days < 0 || days > 7) continue
    const name = nameOf(e.instrumentId, { article: false })
    items.push({
      id: `event:${e.kind}:${e.instrumentId}:${e.date}`,
      kind: "event",
      at: Date.parse(`${e.date}T04:00:00Z`),
      instrumentId: e.instrumentId,
      title: e.kind === "RESULTS" ? `${name} reports results ${when(e.date, now)}.` : `${name} goes ex-dividend ${when(e.date, now)}.`,
      detail: [e.detail, why(interests.get(e.instrumentId))].filter(Boolean).join(" · ") || undefined,
      href: hrefById(e.instrumentId),
      tone: "neutral",
      score: weight(70, 45) - days * 2,
    })
  }

  // Tests that finished lately: the latest run of each.
  const seen = new Set<string>()
  for (const t of [...input.tests].sort((a, b) => b.finishedAt - a.finishedAt)) {
    if (seen.has(t.name)) continue
    seen.add(t.name)
    const v = verdictOf(t.definition, t.metrics)
    items.push({
      id: `test:${t.runId}`,
      kind: "test",
      at: t.finishedAt,
      title: `Your test “${t.name}” finished: ${v.text.charAt(0).toLowerCase()}${v.text.slice(1)}.`,
      href: `/lab/runs/${t.runId}`,
      tone: v.tone === "flat" ? "neutral" : v.tone,
      score: weight(40, 50) - (now - t.finishedAt) / DAY,
    })
  }

  // The biggest mover in each sector you follow, if it isn't already here.
  for (const sector of preferences.sectors) {
    let top: { inst: Instrument; q: Quote; z: number } | null = null
    for (const inst of EQUITIES) {
      if (inst.sector !== sector || covered.has(inst.id) || interests.has(inst.id)) continue
      const q = input.quote(inst.id)
      if (!q) continue
      const z = Math.abs(q.changePct) / usualMove(inst)
      if (!top || z > top.z) top = { inst, q, z }
    }
    if (!top || top.z < 1) continue
    const up = top.q.changePct >= 0
    items.push({
      id: `sector:${sector}:${day}`,
      kind: "sector",
      at: now,
      instrumentId: top.inst.id,
      title: `In ${sector}, which you follow, ${top.inst.name} moved most: ${up ? "up" : "down"} ${pct(Math.abs(top.q.changePct / 100))}.`,
      href: hrefById(top.inst.id),
      tone: up ? "up" : "down",
      score: 30 + Math.min(top.z, 4) * 4,
    })
  }

  return items.sort((a, b) => b.score - a.score || b.at - a.at).slice(0, MAX_ITEMS)
}

/** The stocks a visitor follows, and why: holdings, alerts, watchlists and the stocks in their tests. */
export function interestsOf(sources: { holdings: number[]; alerts: number[]; watchlists: number[]; lab: number[] }): Map<number, Reason[]> {
  const out = new Map<number, Reason[]>()
  const add = (ids: number[], reason: Reason) => {
    for (const id of ids) {
      const reasons = out.get(id) ?? []
      if (!reasons.includes(reason)) reasons.push(reason)
      out.set(id, reasons)
    }
  }
  add(sources.holdings, "holding")
  add(sources.alerts, "alert")
  add(sources.watchlists, "watchlist")
  add(sources.lab, "lab")
  return out
}
