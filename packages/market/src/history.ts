import { getInstrument } from "./catalog"
import { gaussian, hashString, mulberry32, roundTo } from "./random"
import type { Candle, Instrument } from "./types"

/**
 * Sample price history. Daily bars are a deterministic random walk per symbol
 * that ends at yesterday's close (an ETF's follow what it tracks); intraday
 * bars are a Brownian bridge from the day's open to the live price, so the
 * chart and the quote agree.
 */

const DAY = 86400

/** IST calendar date at 00:00, returned as unix seconds for a UTC midnight. */
function istMidnight(date: Date): number {
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000)
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) / 1000
}

/**
 * A random generator for one bar, `back` sessions before the latest, so a bar
 * comes out the same however many sessions are asked for: a year's chart and
 * the 52-week range agree with the five-year series around them.
 */
function barRng(symbol: string, salt: number, back: number) {
  return mulberry32((hashString(symbol) ^ salt ^ Math.imul(back + 1, 0x9e3779b1)) >>> 0)
}

/** The last `days` weekday sessions before today, oldest first, as unix seconds of IST midnight. */
function sessionTimes(days: number, today: Date): number[] {
  const times: number[] = []
  let t = istMidnight(today) - DAY
  while (times.length < days) {
    const wd = new Date(t * 1000).getUTCDay()
    if (wd !== 0 && wd !== 6) times.push(t)
    t -= DAY
  }
  return times.reverse()
}

/** An ETF's bars: its index's, scaled to the ETF's price, with a small wandering tracking gap. */
function trackedCandles(inst: Instrument, target: Instrument, days: number, today: Date): Candle[] {
  const rng = mulberry32(hashString(inst.symbol) ^ 0x7f4a7c15)
  const base = dailyCandles(target, days, today)
  const scale = inst.prevClose / target.prevClose
  // Walk the gap backwards from the latest session's, which is none, so the last close is the ETF's own.
  const gaps: number[] = []
  let gap = 0
  for (let k = 0; k < days; k++) {
    gaps.push(gap)
    gap = gap * 0.97 + gaussian(rng) * 0.0004
  }
  return base.map((c, i) => {
    const back = days - 1 - i
    const f = scale * (1 + gaps[back]!)
    const volume = Math.round((inst.avgVolume || 1e5) * (0.55 + barRng(inst.symbol, 0x51ed27, back)() * 0.9))
    return { time: c.time, open: roundTo(c.open * f, inst.tick), high: roundTo(c.high * f, inst.tick), low: roundTo(c.low * f, inst.tick), close: roundTo(c.close * f, inst.tick), volume }
  })
}

/** Money-market and bond funds creep up; everything else drifts at a stock market's pace. */
function dailyDrift(inst: Instrument): number {
  if (inst.category === "Liquid") return 0.00025
  if (inst.category === "Bonds") return 0.0003
  return 0.00045
}

/**
 * `days` daily bars ending at yesterday's close. Closes walk backwards from
 * it, one draw a session, and each bar's open, range and volume come from a
 * generator of its own: asking for fewer sessions gives the tail of a longer
 * series, bar for bar.
 */
export function dailyCandles(inst: Instrument, days = 750, today = new Date()): Candle[] {
  const target = inst.tracks != null ? getInstrument(inst.tracks) : undefined
  if (target) return trackedCandles(inst, target, days, today)
  const rng = mulberry32(hashString(inst.symbol) ^ 0x9e3779b9)
  const dayVol = inst.vol / Math.sqrt(252)
  const drift = dailyDrift(inst)
  // back[k] is the close k sessions before the latest; one more than asked for, as the oldest bar's previous close.
  const back: number[] = [inst.prevClose]
  for (let k = 1; k <= days; k++) back.push(back[k - 1]! / (1 + gaussian(rng) * dayVol + drift))

  const times = sessionTimes(days, today)
  const candles: Candle[] = []
  for (let i = 0; i < days; i++) {
    const k = days - 1 - i
    const close = back[k]!
    const prev = back[k + 1]!
    const bar = barRng(inst.symbol, 0x2545f491, k)
    const open = prev * (1 + gaussian(bar) * dayVol * 0.3)
    const high = Math.max(open, close) * (1 + Math.abs(gaussian(bar)) * dayVol * 0.45)
    const low = Math.min(open, close) * (1 - Math.abs(gaussian(bar)) * dayVol * 0.45)
    const volume = Math.round(inst.avgVolume * (0.55 + bar() * 0.9 + Math.abs(close / prev - 1) * 12))
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
