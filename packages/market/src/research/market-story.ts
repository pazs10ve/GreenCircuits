import { EQUITIES, INDEX, getInstrument, marketCapCr, membersOf } from "../catalog"
import type { Instrument, Quote, Sector } from "../types"
import { formatNumber } from "../format"
import { dailyCandles } from "../history"

/**
 * Today's market, written as a headline and a standfirst from the quotes.
 * Templates, not a language model: every sentence can be traced to a number.
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

type Read = (id: number) => Quote | undefined

/** Stocks' and sectors' contributions to the Nifty's move, in index points. */
export function niftyAttribution(read: Read): { contributions: Contribution[]; sectors: SectorMove[] } {
  const nifty = getInstrument(INDEX.NIFTY)!
  const members = membersOf(INDEX.NIFTY)
  const total = members.reduce((s, e) => s + marketCapCr(e, e.prevClose), 0)
  const contributions: Contribution[] = members.map((inst) => {
    const q = read(inst.id)
    const pct = q?.changePct ?? 0
    return { inst, changePct: pct, points: (marketCapCr(inst, inst.prevClose) / total) * (pct / 100) * nifty.prevClose }
  })
  const bySector = new Map<Sector, { points: number; cap: number; weighted: number }>()
  for (const c of contributions) {
    const s = c.inst.sector!
    const cap = marketCapCr(c.inst, c.inst.prevClose)
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

export function marketStory(read: Read): MarketStory | null {
  const nifty = read(INDEX.NIFTY)
  if (!nifty) return null
  const p = nifty.changePct
  const { contributions, sectors } = niftyAttribution(read)
  let advancers = 0
  let decliners = 0
  for (const e of EQUITIES) {
    const q = read(e.id)
    if (!q) continue
    if (q.changePct > 0) advancers++
    else if (q.changePct < 0) decliners++
  }

  const up = p >= 0
  // The sector that did most to move the index in today's direction, and the one that pushed back hardest.
  const bySupport = [...sectors].sort((a, b) => b.points - a.points)
  const lead = up ? bySupport[0]! : bySupport.at(-1)!
  const against = up ? bySupport.at(-1)! : bySupport[0]!
  const leadNoun = SECTOR_NOUN[lead.sector]
  const level = formatNumber(nifty.ltp, 0)
  const size = Math.abs(p)

  let headline: string
  if (size < 0.1) {
    headline = `Nifty is flat at ${level} as ${SECTOR_NOUN[bySupport[0]!.sector].noun} offset ${SECTOR_NOUN[bySupport.at(-1)!.sector].noun}`
  } else if (size < 0.5) {
    headline = up ? `Nifty edges up ${pct(p)}, helped by ${leadNoun.noun}` : `Nifty slips ${pct(p)}, dragged down by ${leadNoun.noun}`
  } else if (size < 1.2) {
    headline = up ? `Nifty rises ${pct(p)}, led by ${leadNoun.noun}` : `Nifty falls ${pct(p)}, with ${leadNoun.noun} leading the decline`
  } else {
    headline = up ? `Nifty jumps ${pct(p)} in broad buying` : `Nifty drops ${pct(p)} in a broad sell-off`
  }

  const movers = up ? contributions.slice(0, 2) : contributions.slice(-2).reverse()
  const counter = up ? contributions.at(-1)! : contributions[0]!
  const moved = up ? advancers : decliners
  const breadth =
    size < 0.1
      ? `${advancers} of the 50 are up and ${decliners} are down.`
      : `${moved} of the 50 stocks are ${up ? "higher" : "lower"}${(up ? decliners > advancers : advancers > decliners) ? ", though more stocks are moving the other way" : ""}.`
  const who =
    size < 0.1
      ? `${names([contributions[0]!.inst])} has added the most points and ${names([contributions.at(-1)!.inst])} has taken off the most.`
      : `${names(movers.map((m) => m.inst))} ${up ? "have added" : "have taken off"} the most points${
          Math.sign(counter.points) !== Math.sign(p) && Math.abs(counter.points) > 1
            ? `, while ${counter.inst.name} ${up ? "held it back" : "cushioned the fall"}`
            : ""
        }.`
  const sectorNote =
    against.sector !== lead.sector && Math.sign(against.changePct) !== Math.sign(p) && Math.abs(against.changePct) > 0.2
      ? ` ${capitalise(SECTOR_NOUN[against.sector].noun)} ${SECTOR_NOUN[against.sector].plural ? "are" : "is"} going the other way, ${against.changePct > 0 ? "up" : "down"} ${pct(against.changePct)}.`
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

const sinceCache = new Map<string, { t: number; r: number }[]>()

/** The stock's daily moves over the last year, memoised per IST day. */
function dailyMoves(inst: Instrument): { t: number; r: number }[] {
  const day = new Date(Date.now() + 19800 * 1000).toISOString().slice(0, 10)
  const key = `${inst.id}:${day}`
  let moves = sinceCache.get(key)
  if (!moves) {
    const c = dailyCandles(inst, 260)
    moves = c.slice(1).map((x, i) => ({ t: x.time, r: (x.close / c[i]!.close - 1) * 100 }))
    sinceCache.set(key, moves)
    if (sinceCache.size > 200) sinceCache.delete(sinceCache.keys().next().value!)
  }
  return moves
}

/** "Its biggest one-day rise since 14 March", or null when the move isn't unusual. */
export function biggestSince(inst: Instrument, changePct: number): string | null {
  const moves = dailyMoves(inst)
  const word = changePct > 0 ? "rise" : "fall"
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]!
    if (Math.sign(m.r) === Math.sign(changePct) && Math.abs(m.r) >= Math.abs(changePct)) {
      if (moves.length - i < 15) return null
      const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(m.t * 1000)
      return `Its biggest one-day ${word} since ${when}`
    }
  }
  return `Its biggest one-day ${word} in more than a year`
}

/**
 * The day's notable moves among Nifty stocks, each with context drawn from
 * the data: how rare the move is for this stock, its sector, its 52-week
 * range and any results due.
 */
export function notableMoves(
  read: Read,
  ranges: Map<number, { high: number; low: number }>,
  results: Map<number, string>,
  limit = 5,
): MoveNote[] {
  const { sectors } = niftyAttribution(read)
  const sectorPct = new Map(sectors.map((s) => [s.sector, s.changePct]))
  const rows = EQUITIES.map((inst) => ({ inst, q: read(inst.id) }))
    .filter((r): r is { inst: Instrument; q: Quote } => r.q != null && r.q.changePct !== 0)
    // Rank by how many "normal days" the move is: today's change against the stock's daily volatility.
    .map((r) => ({ ...r, z: r.q.changePct / ((r.inst.vol / Math.sqrt(252)) * 100) }))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, limit)

  return rows.map(({ inst, q }) => {
    const up = q.changePct > 0
    const sp = sectorPct.get(inst.sector!) ?? 0
    const { noun, plural } = SECTOR_NOUN[inst.sector!]
    const sentences: string[] = []

    const since = biggestSince(inst, q.changePct)
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
    else if (fiftyTwo) sentences.push(`It is trading at ${fiftyTwo}.`)

    const others = inst.sector === "Telecom" ? "Other telecom stocks" : `Other ${noun}`
    if (Math.abs(sp) >= 0.15 && Math.sign(sp) !== Math.sign(q.changePct)) {
      sentences.push(`It is going against its sector: ${others.toLowerCase()} ${plural || inst.sector === "Telecom" ? "are" : "is"} ${sp > 0 ? "up" : "down"} ${pct(sp)}.`)
    } else if (Math.abs(sp) >= 0.3) {
      sentences.push(`${others} ${plural || inst.sector === "Telecom" ? "are" : "is"} ${sp > 0 ? "up" : "down"} ${pct(sp)} too.`)
    }

    const due = results.get(inst.id)
    if (due) sentences.push(`Results are due on ${due}.`)

    if (sentences.length === 0) {
      sentences.push(`${up ? "Up" : "Down"} ${pct(q.changePct)} on a quiet day for ${noun}, which ${plural ? "are" : "is"} ${sp >= 0 ? "up" : "down"} ${pct(sp)}.`)
    }
    return { inst, q, note: sentences.slice(0, 2).join(" ") }
  })
}
