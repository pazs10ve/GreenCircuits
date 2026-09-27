import { describe, expect, it } from "vitest"
import { black76, impliedVol } from "./black76"

describe("Black-76", () => {
  const F = 24_500
  const T = 30 / 365
  const r = 0.065

  it("satisfies put-call parity on the forward", () => {
    for (const K of [22_000, 24_500, 27_000]) {
      const call = black76("CE", F, K, T, 0.14, r).price
      const put = black76("PE", F, K, T, 0.14, r).price
      expect(call - put).toBeCloseTo(Math.exp(-r * T) * (F - K), 6)
    }
  })

  it("recovers the volatility it priced with", () => {
    for (const K of [22_000, 24_500, 27_000]) {
      for (const type of ["CE", "PE"] as const) {
        const price = black76(type, F, K, T, 0.18, r).price
        expect(impliedVol(type, price, F, K, T, r)).toBeCloseTo(0.18, 4)
      }
    }
  })

  it("has no implied volatility below intrinsic value", () => {
    expect(impliedVol("CE", 100, F, 24_000, T, r)).toBeNull()
  })

  it("prices at intrinsic value at expiry", () => {
    expect(black76("CE", F, 24_000, 0, 0.2).price).toBe(500)
    expect(black76("PE", F, 24_000, 0, 0.2).price).toBe(0)
  })
})
