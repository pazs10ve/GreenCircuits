import type { Quote } from "@greencircuits/market/types"

/**
 * Shared names and wire formats. The ingestor writes quotes to Valkey, the
 * stream gateway fans them out to browsers, and the API reads snapshots; all
 * three agree on these keys and shapes.
 */
export const KEYS = {
  /** Hash: instrument id → latest Quote as JSON. */
  quotes: "gc:quotes",
  /** Pub/sub channel: one JSON Quote[] per ingestor flush (only instruments that changed). */
  ticks: "gc:ticks",
  /** Unix ms of the ingestor's last flush; the API's health check reads it. */
  heartbeat: "gc:ingestor:heartbeat",
  /** JSON FeedSession: which feed is running and what its prices are. */
  session: "gc:market:session",
} as const

/**
 * A quote on the browser wire: a fixed-order array keeps frames small.
 * [id, ltp, open, high, low, prevClose, volume, ts]
 */
export type WireQuote = [id: number, ltp: number, open: number, high: number, low: number, prevClose: number, volume: number, ts: number]

export type Source = "LIVE" | "DELAYED" | "EOD" | "SIMULATED"

/**
 * Where history and company figures come from: "real" once the real-data
 * loader has filled the database (pipelines: greencircuits.jobs.real_data),
 * "sample" for the demo generators and the seeded database.
 */
export type Dataset = "real" | "sample"

/** What the running feed writes under KEYS.session. */
export interface FeedSession {
  provider: "simulator" | "yahoo"
  /** SIMULATED from the simulator; DELAYED while NSE trades and EOD otherwise, from Yahoo. */
  source: Source
  startedAt: number
  instruments: number
  /** The simulator's seed and trading day. */
  seed?: number
  day?: string
}

/** The session a feed stored, or null. Sessions written before providers existed were all simulated. */
export function readSession(raw: string | null | undefined): FeedSession | null {
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as Partial<FeedSession>
    return { provider: s.provider ?? "simulator", source: s.source ?? "SIMULATED", startedAt: s.startedAt ?? 0, instruments: s.instruments ?? 0, seed: s.seed, day: s.day }
  } catch {
    return null
  }
}

/** Frames the gateway sends. */
export type ServerFrame =
  | { t: "hello"; source: Source; flushMs: number }
  | { t: "q"; q: WireQuote[] }
  | { t: "pong" }
  | { t: "error"; message: string }

/** Frames a client sends. */
export type ClientFrame = { op: "sub"; ids: number[] } | { op: "unsub"; ids: number[] } | { op: "ping" }

/** Prices go out at 4 decimal places (enough for 0.0025 currency ticks), which also drops float noise. */
const p4 = (v: number) => Math.round(v * 1e4) / 1e4

export function toWire(q: Quote): WireQuote {
  return [q.id, p4(q.ltp), p4(q.open), p4(q.high), p4(q.low), p4(q.prevClose), q.volume, q.ts]
}

/** Rebuild a full Quote from the wire. Bid and ask are not sent in this mode, so they collapse to the last price. */
export function fromWire(w: WireQuote, previous?: Quote): Quote {
  const [id, ltp, open, high, low, prevClose, volume, ts] = w
  const change = ltp - prevClose
  return {
    id,
    ltp,
    open,
    high,
    low,
    prevClose,
    change,
    changePct: prevClose ? (change / prevClose) * 100 : 0,
    volume,
    bid: ltp,
    ask: ltp,
    ts,
    tickDir: previous ? (ltp > previous.ltp ? 1 : ltp < previous.ltp ? -1 : 0) : 0,
  }
}

/** Keep client input sane: at most this many instruments per socket. */
export const MAX_SUBSCRIPTIONS = 500
