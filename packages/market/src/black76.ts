/**
 * Black-76 on the forward: Indian index and stock options are European and
 * priced off the same-expiry future (or a synthetic forward from put-call
 * parity). Shared by the option chain, the payoff builder and the simulator.
 */

export type OptionType = "CE" | "PE"

const SQRT_2PI = Math.sqrt(2 * Math.PI)

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf), accurate to ~1e-7. */
export function normCdf(x: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const sign = x < 0 ? -1 : 1
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + p * z)
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z)
  return 0.5 * (1 + sign * y)
}

export interface Greeks {
  price: number
  delta: number
  gamma: number
  theta: number // per calendar day
  vega: number // per 1 vol point
}

/** F forward, K strike, T years, sigma vol, r rate. */
export function black76(type: OptionType, F: number, K: number, T: number, sigma: number, r = 0.065): Greeks {
  const df = Math.exp(-r * T)
  if (T <= 0 || sigma <= 0) {
    const intrinsic = type === "CE" ? Math.max(F - K, 0) : Math.max(K - F, 0)
    return { price: intrinsic, delta: type === "CE" ? (F > K ? 1 : 0) : F < K ? -1 : 0, gamma: 0, theta: 0, vega: 0 }
  }
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT)
  const d2 = d1 - sigma * sqrtT
  const nd1 = normPdf(d1)
  let price: number
  let delta: number
  if (type === "CE") {
    price = df * (F * normCdf(d1) - K * normCdf(d2))
    delta = df * normCdf(d1)
  } else {
    price = df * (K * normCdf(-d2) - F * normCdf(-d1))
    delta = -df * normCdf(-d1)
  }
  const gamma = (df * nd1) / (F * sigma * sqrtT)
  const vega = (df * F * nd1 * sqrtT) / 100
  const thetaYear = -(df * F * nd1 * sigma) / (2 * sqrtT) + r * price
  return { price, delta, gamma, theta: thetaYear / 365, vega }
}

/** Implied volatility by Newton's method with a bisection fallback. */
export function impliedVol(type: OptionType, price: number, F: number, K: number, T: number, r = 0.065): number | null {
  const intrinsic = Math.exp(-r * T) * (type === "CE" ? Math.max(F - K, 0) : Math.max(K - F, 0))
  if (price <= intrinsic + 1e-6 || T <= 0) return null
  let sigma = 0.2
  for (let i = 0; i < 20; i++) {
    const g = black76(type, F, K, T, sigma, r)
    const diff = g.price - price
    if (Math.abs(diff) < 1e-5) return sigma
    const vega = g.vega * 100
    if (vega < 1e-8) break
    sigma -= diff / vega
    if (sigma <= 0.001 || sigma > 5) break
  }
  let lo = 0.001
  let hi = 5
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    const p = black76(type, F, K, T, mid, r).price
    if (p > price) hi = mid
    else lo = mid
    if (hi - lo < 1e-6) break
  }
  return (lo + hi) / 2
}

/** Years to a 15:30 IST expiry on the given date. */
export function yearsToExpiry(expiry: Date, now = new Date()): number {
  const ms = expiry.getTime() - now.getTime()
  return Math.max(ms, 0) / (365 * 24 * 3600 * 1000)
}
