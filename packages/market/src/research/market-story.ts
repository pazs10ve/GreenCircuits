import { EQUITIES, INDEX, getInstrument, marketCapCr, membersOf } from "../catalog"
import type { Candle, Instrument, Quote, Sector } from "../types"
import { formatNumber } from "../format"
import { dailyCandles } from "../history"
import { istDate } from "../session"

/**
 * Today's market, written as a headline and a standfirst from the quotes.
 * Templates, not a language model: every sentence can be traced to a number.
 * While the market trades it's written in the present tense; once the session
 * is over (`closed`), in the past tense, saying when.
 */

const SECTOR_NOUN: Record<Sector, { noun: string; plural: boolean }> = {
  Financials: { noun: "banks and financials", plural: true },
  IT: { noun: "IT stocks", plural: true },
  Energy: { noun: "energy stocks", plural: true },
  Consumer: { noun: "consumer stocks", plural: true },
  Auto: { noun: "carmakers", plural: true },
  Healthcare: { noun: "drugmakers", plural: true },
  Materials: { noun: "metal and cement stocks", plural: true },
  Industrials: { noun: "industrials", plural: true },
  Telecom: { noun: "telecom", plural: false },
  Utilities: { noun: "power utilities", plural: true },
}

export interface Contribution {
  inst: Instrument
  /** Index points added (positive) or taken off (negative). */
  points: number
  changePct: number
}

export interface SectorMove {
  sector: Sector
  points: number
  /** Market-cap-weighted change of the sector's Nifty members, in %. */
  changePct: number
}

export interface MarketStory {
  headline: string
  standfirst: string
  niftyPct: number
  advancers: number
  decliners: number
  contributions: Contribution[]
  sectors: SectorMove[]
}

export interface StoryOptions {
  /** The Nifty 50's members (ids); the demo universe's membership when absent. */
  members?: number[]
  /** When the session being described ended ("today", "on Friday"); absent while it trades. */
  closed?: string | null
}

type Read = (id: number) => Quote | undefined

/**
 * Stocks' and sectors' contributions to the Nifty's move, in index points,
 * weighted by market value at the previous close.
 */
export function niftyAttribution(read: Read, members?: number[]): { contributions: Contribution[]; sectors: SectorMove[] } {
  const nifty = getInstrument(INDEX.NIFTY)!
  const list = members ? members.flatMap((id) => getInstrument(id) ?? []) : membersOf(INDEX.NIFTY)
  const capOf = (inst: Instrument) => marketCapCr(inst, read(inst.id)?.prevClose ?? inst.prevClose)
  const level = read(INDEX.NIFTY)?.prevClose ?? nifty.prevClose
  const total = list.reduce((s, e) => s + capOf(e), 0)
  const contributions: Contribution[] = list.map((inst) => {
    const pct = read(inst.id)?.changePct ?? 0
    return { inst, changePct: pct, points: (capOf(inst) / total) * (pct / 100) * level }
  })
  const bySector = new Map<Sector, { points: number; cap: number; weighted: number }>()
  for (const c of contributions) {
    const s = c.inst.sector!
    const cap = capOf(c.inst)
    const cur = bySector.get(s) ?? { points: 0, cap: 0, weighted: 0 }
    bySector.set(s, { points: cur.points + c.points, cap: cur.cap + cap, weighted: cur.weighted + cap * c.changePct })
  }
  const sectors = [...bySector.entries()].map(([sector, v]) => ({ sector, points: v.points, changePct: v.weighted / v.cap }))
  return {
    contributions: contributions.sort((a, b) => b.points - a.points),
    sectors: sectors.sort((a, b) => b.changePct - a.changePct),
  }
}

function pct(v: number, digits = 1): string {
  return `${formatNumber(Math.abs(v), digits)}%`
}

function names(list: Instrument[]): string {
  const n = list.map((i) => i.name)
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`
}

export function marketStory(read: Read, { members, closed }: StoryOptions = {}): MarketStory | null {
  const nifty = read(INDEX.NIFTY)
  if (!nifty) return null
  const p = nifty.changePct
  const { contributions, sectors } = niftyAttribution(read, members)
  if (contributions.length === 0) return null
  let advancers = 0
  let decliners = 0
  let counted = 0
  for (const e of EQUITIES) {
    const q = read(e.id)
    if (!q) continue
    counted++
    if (q.changePct > 0) advancers++
    else if (q.changePct < 0) decliners++
  }

  const past = closed != null
  const when = past ? ` ${closed}` : ""
  const up = p >= 0
  // The sector that did most to move the index in the day's direction, and the one that pushed back hardest.
  const bySupport = [...sectors].sort((a, b) => b.points - a.points)
  const lead = up ? bySupport[0]! : bySupport.at(-1)!
  const against = up ? bySupport.at(-1)! : bySupport[0]!
  const leadNoun = SECTOR_NOUN[lead.sector].noun
  const level = formatNumber(nifty.ltp, 0)
  const size = Math.abs(p)

  let headline: string
  if (size < 0.1) {
    const offset = `${SECTOR_NOUN[bySupport[0]!.sector].noun} offset ${SECTOR_NOUN[bySupport.at(-1)!.sector].noun}`
    headline = past ? `Nifty ended flat at ${level}${when} as ${offset}` : `Nifty is flat at ${level} as ${offset}`
  } else if (size < 0.5) {
    headline = up
      ? `Nifty ${past ? "closed up" : "edges up"} ${pct(p)}${when}, helped by ${leadNoun}`
      : `Nifty ${past ? "slipped" : "slips"} ${pct(p)}${when}, dragged down by ${leadNoun}`
  } else if (size < 1.2) {
    headline = up
      ? `Nifty ${past ? "rose" : "rises"} ${pct(p)}${when}, led by ${leadNoun}`
      : `Nifty ${past ? "fell" : "falls"} ${pct(p)}${when}, with ${leadNoun} leading the decline`
  } else {
    headline = up
      ? `Nifty ${past ? "jumped" : "jumps"} ${pct(p)}${when} in broad buying`
      : `Nifty ${past ? "dropped" : "drops"} ${pct(p)}${when} in a broad sell-off`
  }

  const movers = up ? contributions.slice(0, 2) : contributions.slice(-2).reverse()
  const counter = up ? contributions.at(-1)! : contributions[0]!
  const moved = up ? advancers : decliners
  const otherWay = (up ? decliners > advancers : advancers > decliners) ? `, though more stocks ${past ? "moved" : "are moving"} the other way` : ""
  const breadth =
    size < 0.1
      ? past
        ? `${advancers} of the ${counted} ended up and ${decliners} down.`
        : `${advancers} of the ${counted} are up and ${decliners} are down.`
      : `${moved} of the ${counted} stocks ${past ? "closed" : "are"} ${up ? "higher" : "lower"}${otherWay}.`
  const who =
    size < 0.1
      ? past
        ? `${names([contributions[0]!.inst])} added the most points and ${names([contributions.at(-1)!.inst])} took off the most.`
        : `${names([contributions[0]!.inst])} has added the most points and ${names([contributions.at(-1)!.inst])} has taken off the most.`
      : `${names(movers.map((m) => m.inst))} ${up ? (past ? "added" : "have added") : past ? "took off" : "have taken off"} the most points${
          Math.sign(counter.points) !== Math.sign(p) && Math.abs(counter.points) > 1
            ? `, while ${counter.inst.name} ${up ? "held it back" : "cushioned the fall"}`
            : ""
        }.`
  const againstNoun = SECTOR_NOUN[against.sector]
  const going = past ? "went" : againstNoun.plural ? "are going" : "is going"
  const sectorNote =
    against.sector !== lead.sector && Math.sign(against.changePct) !== Math.sign(p) && Math.abs(against.changePct) > 0.2
      ? ` ${capitalise(againstNoun.noun)} ${going} the other way, ${against.changePct > 0 ? "up" : "down"} ${pct(against.changePct)}.`
      : ""

  return {
    headline,
    standfirst: `${breadth} ${who}${sectorNote}`,
    niftyPct: p,
    advancers,
    decliners,
    contributions,
    sectors,
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface MoveNote {
  inst: Instrument
  q: Quote
  note: string
}

/** A day's close-to-close move, in per cent, stamped with the day's unix time. */
export interface DailyMove {
  t: number
  r: number
}

/** Daily moves from bars, leaving out the session on `day` (YYYY-MM-DD) and anything after it. */
export function movesBefore(candles: Candle[], day: string): DailyMove[] {
  const before = candles.filter((c) => new Date(c.time * 1000).toISOString().slice(0, 10) < day)
  return before.slice(1).map((x, i) => ({ t: x.time, r: (x.close / before[i]!.close - 1) * 100 }))
}

const sinceCache = new Map<string, DailyMove[]>()

/** The demo stock's daily moves over the last year, memoised per IST day. */
function demoMoves(inst: Instrument): DailyMove[] {
  const key = `${inst.id}:${istDate(Date.now())}`
  let moves = sinceCache.get(key)
  if (!moves) {
    const c = dailyCandles(inst, 260)
    moves = c.slice(1).map((x, i) => ({ t: x.time, r: (x.close / c[i]!.close - 1) * 100 }))
    sinceCache.set(key, moves)
    if (sinceCache.size > 200) sinceCache.delete(sinceCache.keys().next().value!)
  }
  return moves
}

/**
 * "Its biggest one-day rise since 14 March", or null when the move isn't
 * unusual. `moves` are the stock's earlier daily moves; the demo generators'
 * when absent.
 */
export function biggestSince(inst: Instrument, changePct: number, moves: DailyMove[] = demoMoves(inst)): string | null {
  const word = changePct > 0 ? "rise" : "fall"
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]!
    if (Math.sign(m.r) === Math.sign(changePct) && Math.abs(m.r) >= Math.abs(changePct)) {
      if (moves.length - i < 15) return null
      const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(m.t * 1000)
      return `Its biggest one-day ${word} since ${when}`
    }
  }
  return moves.length >= 200 ? `Its biggest one-day ${word} in more than a year` : null
}

/** The stocks whose moves are most unusual for them: the change against the stock's daily volatility. */
export function unusualMoves(read: Read, limit = 5): { inst: Instrument; q: Quote }[] {
  return EQUITIES.map((inst) => ({ inst, q: read(inst.id) }))
    .filter((r): r is { inst: Instrument; q: Quote } => r.q != null && r.q.changePct !== 0)
    .map((r) => ({ ...r, z: r.q.changePct / ((r.inst.vol / Math.sqrt(252)) * 100) }))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, limit)
    .map(({ inst, q }) => ({ inst, q }))
}

/**
 * The day's notable moves, each with context drawn from the data: how rare
 * the move is for this stock, its sector, its 52-week range and any results
 * due. `history` gives real daily bars; when it's passed but has none for a
 * stock yet, the rarity is left out rather than guessed.
 */
export function notableMoves(
  read: Read,
  ranges: Map<number, { high: number; low: number }>,
  results: Map<number, string>,
  limit = 5,
  { members, closed, history }: StoryOptions & { history?: (id: number) => Candle[] | undefined } = {},
): MoveNote[] {
  const { sectors } = niftyAttribution(read, members)
  const sectorPct = new Map(sectors.map((s) => [s.sector, s.changePct]))
  const past = closed != null

  return unusualMoves(read, limit).map(({ inst, q }) => {
    const up = q.changePct > 0
    const sp = sectorPct.get(inst.sector!) ?? 0
    const { noun, plural } = SECTOR_NOUN[inst.sector!]
    const are = past ? (plural ? "were" : "was") : plural ? "are" : "is"
    const sentences: string[] = []

    let since: string | null
    if (history) {
      const bars = history(inst.id)
      since = bars ? biggestSince(inst, q.changePct, movesBefore(bars, istDate(q.ts))) : null
    } else {
      since = biggestSince(inst, q.changePct)
    }
    const range = ranges.get(inst.id)
    let fiftyTwo: string | null = null
    if (range) {
      const high = Math.max(range.high, q.high)
      const low = Math.min(range.low, q.low)
      if (q.ltp >= high * 0.995) fiftyTwo = "a 52-week high"
      else if (q.ltp <= low * 1.005) fiftyTwo = "a 52-week low"
    }
    if (since && fiftyTwo) sentences.push(`${since}, taking it to ${fiftyTwo}.`)
    else if (since) sentences.push(`${since}.`)
    else if (fiftyTwo) sentences.push(past ? `It closed at ${fiftyTwo}.` : `It is trading at ${fiftyTwo}.`)

    const others = inst.sector === "Telecom" ? "Other telecom stocks" : `Other ${noun}`
    const othersAre = past ? "were" : "are"
    if (Math.abs(sp) >= 0.15 && Math.sign(sp) !== Math.sign(q.changePct)) {
      sentences.push(`It ${past ? "went" : "is going"} against its sector: ${others.toLowerCase()} ${othersAre} ${sp > 0 ? "up" : "down"} ${pct(sp)}.`)
    } else if (Math.abs(sp) >= 0.3) {
      sentences.push(`${others} ${othersAre} ${sp > 0 ? "up" : "down"} ${pct(sp)} too.`)
    }

    const due = results.get(inst.id)
    if (due) sentences.push(`Results are due on ${due}.`)

    if (sentences.length === 0) {
      sentences.push(`${up ? "Up" : "Down"} ${pct(q.changePct)} on a quiet day for ${noun}, which ${are} ${sp >= 0 ? "up" : "down"} ${pct(sp)}.`)
    }
    return { inst, q, note: sentences.slice(0, 2).join(" ") }
  })
}
