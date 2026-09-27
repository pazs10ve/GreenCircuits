/** Return and risk measures used by the experiments and company pages. */

const DAY_MS = 86400000

/** Compound annual growth rate, in %. */
export function cagr(start: number, end: number, years: number): number {
  if (start <= 0 || end <= 0 || years <= 0) return 0
  return (Math.pow(end / start, 1 / years) - 1) * 100
}

/** Largest peak-to-trough fall, in % (negative). */
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity
  let worst = 0
  for (const v of values) {
    peak = Math.max(peak, v)
    if (peak > 0) worst = Math.min(worst, v / peak - 1)
  }
  return worst * 100
}

/**
 * Internal rate of return for dated cash flows (money in negative, money out
 * positive), annualised, in %. Newton's method with a bisection fallback.
 */
export function xirr(flows: { date: number; amount: number }[]): number {
  if (flows.length < 2) return 0
  const t0 = flows[0]!.date
  const years = flows.map((f) => (f.date - t0) / (365 * DAY_MS))
  const npv = (r: number) => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, years[i]!), 0)
  const dnpv = (r: number) => flows.reduce((s, f, i) => s - (years[i]! * f.amount) / Math.pow(1 + r, years[i]! + 1), 0)
  let r = 0.1
  for (let i = 0; i < 50; i++) {
    const f = npv(r)
    const d = dnpv(r)
    if (Math.abs(d) < 1e-12) break
    const next = r - f / d
    if (!Number.isFinite(next) || next <= -0.99) break
    if (Math.abs(next - r) < 1e-9) return next * 100
    r = next
  }
  let lo = -0.99
  let hi = 5
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (npv(mid) > 0) lo = mid
    else hi = mid
  }
  return ((lo + hi) / 2) * 100
}

/** Wilder's RSI for every bar (NaN until there is enough history). */
export function rsiSeries(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(Number.NaN)
  if (closes.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!
    if (d > 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

/** Highest value over the trailing window, including the current bar. */
export function rollingMax(values: number[], window: number): number[] {
  const out: number[] = []
  const deque: number[] = []
  for (let i = 0; i < values.length; i++) {
    while (deque.length && values[deque.at(-1)!]! <= values[i]!) deque.pop()
    deque.push(i)
    if (deque[0]! <= i - window) deque.shift()
    out.push(values[deque[0]!]!)
  }
  return out
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Share of values strictly below x, in %. */
export function percentileOf(values: number[], x: number): number {
  if (values.length === 0) return 50
  return (values.filter((v) => v < x).length / values.length) * 100
}
