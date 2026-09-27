import { npMean } from "./numeric"

/**
 * Indicators on daily closes, as in pipelines/.../lab/indicators.py. Every
 * function returns an array aligned to its input, NaN until there is enough
 * history, so a signal can never look ahead. A series can start with NaN (an
 * instrument listed after the calendar begins); indicators start from its
 * first real value, so a leading gap never poisons what follows.
 */

const nans = (n: number) => new Array<number>(n).fill(Number.NaN)

function onValid(x: number[], fn: (y: number[]) => number[]): number[] {
  const out = nans(x.length)
  const first = x.findIndex((v) => !Number.isNaN(v))
  if (first === -1) return out
  const r = fn(x.slice(first))
  for (let i = 0; i < r.length; i++) out[first + i] = r[i]!
  return out
}

export function sma(x: number[], n: number): number[] {
  return onValid(x, (y) => {
    const out = nans(y.length)
    if (y.length < n) return out
    // Running sums, then differences: the same arithmetic as NumPy's cumsum version.
    const c = new Array<number>(y.length + 1)
    c[0] = 0
    for (let i = 0; i < y.length; i++) c[i + 1] = c[i]! + y[i]!
    for (let i = n - 1; i < y.length; i++) out[i] = (c[i + 1]! - c[i + 1 - n]!) / n
    return out
  })
}

export function ema(x: number[], n: number): number[] {
  return onValid(x, (y) => {
    const out = nans(y.length)
    if (y.length < n) return out
    const k = 2 / (n + 1)
    out[n - 1] = npMean(y.slice(0, n))
    for (let i = n; i < y.length; i++) out[i] = y[i]! * k + out[i - 1]! * (1 - k)
    return out
  })
}

/** Wilder's RSI. */
export function rsi(x: number[], n = 14): number[] {
  return onValid(x, (y) => {
    const out = nans(y.length)
    if (y.length <= n) return out
    const gain: number[] = []
    const loss: number[] = []
    for (let i = 1; i < y.length; i++) {
      const d = y[i]! - y[i - 1]!
      gain.push(d > 0 ? d : 0)
      loss.push(d < 0 ? -d : 0)
    }
    let g = npMean(gain.slice(0, n))
    let l = npMean(loss.slice(0, n))
    out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l)
    for (let i = n + 1; i < y.length; i++) {
      g = (g * (n - 1) + gain[i - 1]!) / n
      l = (l * (n - 1) + loss[i - 1]!) / n
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l)
    }
    return out
  })
}

/** Highest value of the previous n bars, excluding the current one (a breakout compares against it). */
export function rollingMax(x: number[], n: number): number[] {
  return onValid(x, (y) => {
    const out = nans(y.length)
    for (let i = n; i < y.length; i++) {
      let m = -Infinity
      for (let j = i - n; j < i; j++) m = Number.isNaN(y[j]!) || Number.isNaN(m) ? Number.NaN : Math.max(m, y[j]!)
      out[i] = m
    }
    return out
  })
}

export function rollingMin(x: number[], n: number): number[] {
  return onValid(x, (y) => {
    const out = nans(y.length)
    for (let i = n; i < y.length; i++) {
      let m = Infinity
      for (let j = i - n; j < i; j++) m = Number.isNaN(y[j]!) || Number.isNaN(m) ? Number.NaN : Math.min(m, y[j]!)
      out[i] = m
    }
    return out
  })
}
