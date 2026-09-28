import { INDEX, INSTRUMENTS as CATALOG, isListedFund } from "./catalog"
import type { Instrument, Quote } from "./types"
import { gaussian, mulberry32, roundTo, type Rng } from "./random"

/**
 * The market simulator. Pure and deterministic for a given seed, so the main
 * thread and the Web Worker can build the same opening state. Prices follow a
 * one-factor model: each stock's return is beta × market + its own noise, and
 * the indices are the market-cap-weighted average of their members, so the
 * heatmap, movers and index levels always agree. An ETF that tracks an index,
 * gold or silver moves with it, give or take a small tracking gap.
 */

/** Simulated market seconds per real second: makes intraday moves visible. */
export const TIME_SCALE = 18
/** How often the worker publishes, in ms (the paid-plan flush interval). */
export const FLUSH_MS = 250

const YEAR_SECONDS = 252 * 6.25 * 3600

interface SimState {
  q: Quote
  /** Price the stock mean-reverts towards during the day. */
  anchor: number
}

export interface Engine {
  step(): Quote[]
  snapshot(): Quote[]
}

function makeQuote(inst: Instrument, ltp: number, open: number, high: number, low: number, volume: number, ts: number): Quote {
  const change = ltp - inst.prevClose
  const spread = Math.max(inst.tick, ltp * 0.0002)
  return {
    id: inst.id,
    ltp,
    open,
    high,
    low,
    prevClose: inst.prevClose,
    change,
    changePct: (change / inst.prevClose) * 100,
    volume,
    bid: roundTo(ltp - spread / 2, inst.tick),
    ask: roundTo(ltp + spread / 2, inst.tick),
    ts,
    tickDir: 0,
  }
}

/**
 * `universe` defaults to the built-in catalog. The ingestor passes the
 * instruments it loaded from the security master (same ids, same parameters),
 * so the server-side market and the in-browser demo move identically for a seed.
 */
export function createEngine(seed: number, now = Date.now(), universe: Instrument[] = CATALOG): Engine {
  const rng: Rng = mulberry32(seed)
  const state = new Map<number, SimState>()
  const INSTRUMENTS = universe
  // Indices with members are computed from them; the VIX follows the Nifty, and an index without members moves on its own.
  const COMPOSITE: Record<number, Instrument[]> = Object.fromEntries(
    universe
      .filter((i) => i.kind === "INDEX" && i.id !== INDEX.VIX)
      .map((index) => [index.id, universe.filter((i) => i.kind === "EQUITY" && i.indices?.includes(index.id))] as const)
      .filter(([, members]) => members.length > 0),
  )
  const byId = new Map(universe.map((i) => [i.id, i]))
  const TRACKERS = universe.filter((i) => i.tracks != null && byId.has(i.tracks))
  const isTracker = new Set(TRACKERS.map((i) => i.id))
  /** Each tracker's price over what its index implies: starts near 1 and wanders a little. */
  const trackingGap = new Map<number, number>()
  const tradesOften = (inst: Instrument) => inst.kind === "EQUITY" || isListedFund(inst)

  // Opening state: the session has been running a while, so changes are non-zero.
  const marketMove = gaussian(rng) * 0.006 + 0.002
  const elapsedFraction = 0.35 + rng() * 0.3

  for (const inst of INSTRUMENTS) {
    if (inst.kind === "INDEX" && (COMPOSITE[inst.id] || inst.id === INDEX.VIX)) continue
    if (isTracker.has(inst.id)) continue
    const dayVol = inst.vol / Math.sqrt(252)
    const drift = inst.beta * marketMove + gaussian(rng) * dayVol * 0.8
    const gap = gaussian(rng) * dayVol * 0.25
    const open = roundTo(inst.prevClose * (1 + gap), inst.tick)
    const ltp = roundTo(inst.prevClose * (1 + drift), inst.tick)
    const high = roundTo(Math.max(open, ltp) * (1 + Math.abs(gaussian(rng)) * dayVol * 0.25), inst.tick)
    const low = roundTo(Math.min(open, ltp) * (1 - Math.abs(gaussian(rng)) * dayVol * 0.25), inst.tick)
    const volume = Math.round(inst.avgVolume * elapsedFraction * (0.6 + rng() * 0.8))
    state.set(inst.id, { q: makeQuote(inst, ltp, open, high, low, volume, now), anchor: ltp })
  }

  const compose = (indexId: number, ts: number, previous?: Quote): Quote => {
    const inst = byId.get(indexId)!
    const members = COMPOSITE[indexId]!
    let wNow = 0
    let wOpen = 0
    let total = 0
    for (const m of members) {
      const s = state.get(m.id)!
      const w = (m.sharesCr ?? 1) * m.prevClose
      total += w
      wNow += w * (s.q.ltp / m.prevClose)
      wOpen += w * (s.q.open / m.prevClose)
    }
    const ltp = roundTo(inst.prevClose * (wNow / total), 0.05)
    const open = previous?.open ?? roundTo(inst.prevClose * (wOpen / total), 0.05)
    const high = Math.max(previous?.high ?? Math.max(open, ltp), ltp)
    const low = Math.min(previous?.low ?? Math.min(open, ltp), ltp)
    const q = makeQuote(inst, ltp, open, high, low, 0, ts)
    q.tickDir = previous ? (ltp > previous.ltp ? 1 : ltp < previous.ltp ? -1 : 0) : 0
    return q
  }

  const vixInst = byId.get(INDEX.VIX)
  const vix = (ts: number, previous?: Quote): Quote => {
    if (!vixInst) throw new Error("No India VIX in the universe")
    const nifty = state.get(INDEX.NIFTY)?.q
    const niftyPct = nifty ? nifty.changePct : 0
    const target = vixInst.prevClose * (1 - niftyPct * 0.045)
    const ltp = roundTo(previous ? previous.ltp + (target - previous.ltp) * 0.08 + gaussian(rng) * 0.01 : target, vixInst.tick)
    const open = previous?.open ?? roundTo(vixInst.prevClose * 1.004, vixInst.tick)
    const q = makeQuote(vixInst, ltp, open, Math.max(previous?.high ?? ltp, ltp, open), Math.min(previous?.low ?? ltp, ltp, open), 0, ts)
    q.tickDir = previous ? (ltp > previous.ltp ? 1 : ltp < previous.ltp ? -1 : 0) : 0
    return q
  }

  /** A tracker's quote from its index's: the same move, scaled by the two closes, times the tracking gap. */
  const track = (inst: Instrument, ts: number, volume: number, previous?: Quote): Quote => {
    const target = byId.get(inst.tracks!)!
    const u = state.get(target.id)!.q
    const scale = (inst.prevClose / target.prevClose) * trackingGap.get(inst.id)!
    const ltp = roundTo(u.ltp * scale, inst.tick)
    const open = previous?.open ?? roundTo(u.open * scale, inst.tick)
    const high = Math.max(previous?.high ?? Math.max(open, ltp), ltp)
    const low = Math.min(previous?.low ?? Math.min(open, ltp), ltp)
    const q = makeQuote(inst, ltp, open, high, low, volume, ts)
    q.tickDir = previous ? (ltp > previous.ltp ? 1 : ltp < previous.ltp ? -1 : 0) : 0
    return q
  }

  for (const id of Object.keys(COMPOSITE).map(Number)) {
    state.set(id, { q: compose(id, now), anchor: 0 })
  }
  if (vixInst) state.set(INDEX.VIX, { q: vix(now), anchor: 0 })
  for (const inst of TRACKERS) {
    trackingGap.set(inst.id, 1 + gaussian(rng) * 0.0008)
    const volume = Math.round(inst.avgVolume * elapsedFraction * (0.6 + rng() * 0.8))
    state.set(inst.id, { q: track(inst, now, volume), anchor: 0 })
  }

  const dt = (FLUSH_MS / 1000) * TIME_SCALE
  const sqrtDt = Math.sqrt(dt / YEAR_SECONDS)

  function step(): Quote[] {
    const ts = Date.now()
    const market = gaussian(rng) * 0.13 * sqrtDt
    const changed: Quote[] = []

    for (const inst of INSTRUMENTS) {
      if (inst.kind === "INDEX" && (COMPOSITE[inst.id] || inst.id === INDEX.VIX)) continue
      if (isTracker.has(inst.id)) continue
      const s = state.get(inst.id)!
      // Not every instrument trades in every 250 ms window.
      const liquidity = tradesOften(inst) ? Math.min(0.95, 0.35 + inst.avgVolume / 3e7) : 0.7
      if (rng() > liquidity) continue

      const idio = gaussian(rng) * inst.vol * sqrtDt
      // Gentle pull towards the day's anchor keeps a long session from drifting away.
      const pull = ((s.anchor - s.q.ltp) / s.q.ltp) * 0.0015
      const r = inst.beta * market + idio + pull
      const raw = s.q.ltp * (1 + r)
      const limit = inst.prevClose * (tradesOften(inst) ? 0.1 : 0.06)
      const clamped = Math.min(inst.prevClose + limit, Math.max(inst.prevClose - limit, raw))
      const ltp = roundTo(clamped, inst.tick)
      if (ltp === s.q.ltp && rng() > 0.2) continue

      const traded = Math.round((inst.avgVolume / (6.25 * 3600 / dt)) * (0.4 + rng() * 1.6 + Math.abs(r) * 400))
      const q = makeQuote(inst, ltp, s.q.open, Math.max(s.q.high, ltp), Math.min(s.q.low, ltp), s.q.volume + traded, ts)
      q.tickDir = ltp > s.q.ltp ? 1 : ltp < s.q.ltp ? -1 : 0
      s.q = q
      if (rng() < 0.002) s.anchor = ltp
      changed.push(q)
    }

    for (const id of Object.keys(COMPOSITE).map(Number)) {
      const prev = state.get(id)!.q
      const q = compose(id, ts, prev)
      if (q.ltp !== prev.ltp) {
        state.get(id)!.q = q
        changed.push(q)
      }
    }
    const prevVix = state.get(INDEX.VIX)?.q
    if (prevVix) {
      const v = vix(ts, prevVix)
      if (v.ltp !== prevVix.ltp) {
        state.get(INDEX.VIX)!.q = v
        changed.push(v)
      }
    }
    // Trackers last, once their indices have moved.
    for (const inst of TRACKERS) {
      if (rng() > Math.min(0.95, 0.35 + inst.avgVolume / 3e7)) continue
      const gap = trackingGap.get(inst.id)!
      trackingGap.set(inst.id, gap + (1 - gap) * 0.02 + gaussian(rng) * 0.00015)
      const s = state.get(inst.id)!
      const traded = Math.round((inst.avgVolume / ((6.25 * 3600) / dt)) * (0.4 + rng() * 1.6))
      const q = track(inst, ts, s.q.volume + traded, s.q)
      if (q.ltp === s.q.ltp && rng() > 0.2) continue
      s.q = q
      changed.push(q)
    }
    return changed
  }

  function snapshot(): Quote[] {
    return [...state.values()].map((s) => s.q)
  }

  return { step, snapshot }
}
