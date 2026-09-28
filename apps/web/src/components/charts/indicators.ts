import { ema, rsi, sma } from "@greencircuits/backtest/indicators"
import type { Candle } from "@greencircuits/market/types"

/** The studies a price chart can add: lines over the candles, or panes of their own under them. */
export type Indicator = "volume" | "sma20" | "sma50" | "sma200" | "ema20" | "bollinger" | "rsi" | "macd"

export const INDICATORS: { id: Indicator; label: string; detail: string; pane: "price" | "own" }[] = [
  { id: "volume", label: "Volume", detail: "Shares traded each bar", pane: "price" },
  { id: "sma20", label: "20-day average", detail: "Simple moving average", pane: "price" },
  { id: "sma50", label: "50-day average", detail: "Simple moving average", pane: "price" },
  { id: "sma200", label: "200-day average", detail: "Simple moving average", pane: "price" },
  { id: "ema20", label: "20-day exponential average", detail: "Weights recent days more", pane: "price" },
  { id: "bollinger", label: "Bollinger bands", detail: "20 days, 2 standard deviations", pane: "price" },
  { id: "rsi", label: "RSI", detail: "14 days: over 70 stretched, under 30 oversold", pane: "own" },
  { id: "macd", label: "MACD", detail: "12 and 26-day averages, 9-day signal", pane: "own" },
]

/** Enough bars before the first one shown for a 200-day average to be there from the start. */
export const WARMUP = 200

/** Bollinger bands: the 20-bar average, two standard deviations either side. */
export function bollinger(close: number[], n = 20, k = 2): { mid: number[]; upper: number[]; lower: number[] } {
  const mid = sma(close, n)
  const upper = close.map(() => Number.NaN)
  const lower = close.map(() => Number.NaN)
  for (let i = n - 1; i < close.length; i++) {
    const m = mid[i]!
    if (Number.isNaN(m)) continue
    let sum = 0
    for (let j = i - n + 1; j <= i; j++) sum += (close[j]! - m) ** 2
    const sd = Math.sqrt(sum / n)
    upper[i] = m + k * sd
    lower[i] = m - k * sd
  }
  return { mid, upper, lower }
}

/** MACD: the 12-bar exponential average less the 26-bar one, its 9-bar signal line, and the gap between them. */
export function macd(close: number[], fast = 12, slow = 26, signal = 9): { line: number[]; signal: number[]; histogram: number[] } {
  const f = ema(close, fast)
  const s = ema(close, slow)
  const line = close.map((_, i) => f[i]! - s[i]!)
  const sig = ema(line, signal)
  return { line, signal: sig, histogram: line.map((v, i) => v - sig[i]!) }
}

export { ema, rsi, sma }

/** Daily bars as weekly ones, each starting on its Monday: five years of days is too many candles to read. */
export function weekly(days: Candle[]): Candle[] {
  const out: Candle[] = []
  for (const c of days) {
    const monday = c.time - ((new Date(c.time * 1000).getUTCDay() + 6) % 7) * 86_400
    const last = out.at(-1)
    if (last && last.time === monday) {
      last.high = Math.max(last.high, c.high)
      last.low = Math.min(last.low, c.low)
      last.close = c.close
      last.volume += c.volume
    } else {
      out.push({ ...c, time: monday })
    }
  }
  return out
}
