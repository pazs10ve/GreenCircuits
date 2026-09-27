import { gaussian, hashString, mulberry32, roundTo } from "./random"
import type { Candle, Instrument } from "./types"

/**
 * Sample price history. Daily bars are a deterministic random walk per symbol
 * that ends at yesterday's close; intraday bars are a Brownian bridge from the
 * day's open to the live price, so the chart and the quote agree.
 */

const DAY = 86400

/** IST calendar date at 00:00, returned as unix seconds for a UTC midnight. */
function istMidnight(date: Date): number {
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000)
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) / 1000
}

export function dailyCandles(inst: Instrument, days = 750, today = new Date()): Candle[] {
  const rng = mulberry32(hashString(inst.symbol) ^ 0x9e3779b9)
  const dayVol = inst.vol / Math.sqrt(252)
  // Walk backwards from yesterday's close, then reverse.
  const closes: number[] = [inst.prevClose]
  const drift = 0.00045
  for (let i = 1; i < days; i++) {
    const r = gaussian(rng) * dayVol + drift
    closes.push(closes[i - 1]! / (1 + r))
  }
  closes.reverse()

  const candles: Candle[] = []
  let t = istMidnight(today) - DAY
  const times: number[] = []
  while (times.length < days) {
    const wd = new Date(t * 1000).getUTCDay()
    if (wd !== 0 && wd !== 6) times.push(t)
    t -= DAY
  }
  times.reverse()

  for (let i = 0; i < days; i++) {
    const close = closes[i]!
    const prev = i > 0 ? closes[i - 1]! : close * (1 - gaussian(rng) * dayVol)
    const open = prev * (1 + gaussian(rng) * dayVol * 0.3)
    const high = Math.max(open, close) * (1 + Math.abs(gaussian(rng)) * dayVol * 0.45)
    const low = Math.min(open, close) * (1 - Math.abs(gaussian(rng)) * dayVol * 0.45)
    const volume = Math.round(inst.avgVolume * (0.55 + rng() * 0.9 + Math.abs(close / prev - 1) * 12))
    candles.push({
      time: times[i]!,
      open: roundTo(open, inst.tick),
      high: roundTo(high, inst.tick),
      low: roundTo(low, inst.tick),
      close: roundTo(close, inst.tick),
      volume,
    })
  }
  return candles
}

/**
 * Today's intraday bars from 09:15 IST to now, bridging open → ltp.
 * `minutes` is the bar size; the last bar is the one still forming.
 */
export function intradayCandles(
  inst: Instrument,
  open: number,
  ltp: number,
  minutes = 5,
  now = new Date(),
  sessionMinutes = 375,
): Candle[] {
  const start = istMidnight(now) + (9 * 60 + 15) * 60 - 5.5 * 3600
  const sinceOpen = (now.getTime() / 1000 - start) / 60
  // The demo market runs around the clock: outside 09:15–15:30 IST, show a full session.
  const elapsed = sinceOpen >= minutes && sinceOpen <= sessionMinutes ? sinceOpen : sessionMinutes
  const bars = Math.max(1, Math.ceil(elapsed / minutes))
  const rng = mulberry32(hashString(inst.symbol + ":intraday:" + minutes) ^ Math.floor(start))
  const barVol = (inst.vol / Math.sqrt(252)) * Math.sqrt(minutes / sessionMinutes)

  // Brownian bridge in log space from ln(open) to ln(ltp).
  const walk: number[] = [0]
  for (let i = 1; i <= bars; i++) walk.push(walk[i - 1]! + gaussian(rng) * barVol)
  const end = Math.log(ltp / open)
  const path = walk.map((w, i) => w - (i / bars) * (walk[bars]! - end))

  const candles: Candle[] = []
  for (let i = 0; i < bars; i++) {
    const o = open * Math.exp(path[i]!)
    const c = open * Math.exp(path[i + 1]!)
    const h = Math.max(o, c) * (1 + Math.abs(gaussian(rng)) * barVol * 0.35)
    const l = Math.min(o, c) * (1 - Math.abs(gaussian(rng)) * barVol * 0.35)
    // U-shaped intraday volume: heavy at the open and close.
    const x = i / Math.max(1, bars - 1)
    const shape = 0.6 + 1.6 * (x - 0.5) ** 2 * 4
    candles.push({
      time: start + i * minutes * 60,
      open: roundTo(o, inst.tick),
      high: roundTo(h, inst.tick),
      low: roundTo(l, inst.tick),
      close: roundTo(c, inst.tick),
      volume: Math.round(((inst.avgVolume || 1e6) / (sessionMinutes / minutes)) * shape * (0.6 + rng() * 0.8)),
    })
  }
  const last = candles[candles.length - 1]
  if (last) last.close = ltp
  return candles
}

/** Close prices only, for sparklines. */
export function sparkline(inst: Instrument, points = 40): number[] {
  return dailyCandles(inst, points).map((c) => c.close)
}

export function fiftyTwoWeek(inst: Instrument): { high: number; low: number } {
  const year = dailyCandles(inst, 250)
  return {
    high: Math.max(...year.map((c) => c.high)),
    low: Math.min(...year.map((c) => c.low)),
  }
}

export function returnsOver(inst: Instrument, sessions: number): number {
  const c = dailyCandles(inst, sessions + 1)
  const first = c[0]!.close
  return (inst.prevClose / first - 1) * 100
}
