import { describe, expect, it } from "vitest"
import { usualDailyMove } from "./year-stats"

describe("usualDailyMove", () => {
  it("is nothing for a price that never moves", () => {
    expect(usualDailyMove(Array.from({ length: 30 }, () => 100))).toBe(0)
  })

  it("is about the size of a steady day's swing", () => {
    // Up 1%, down back again, for thirty days: each change is about 1% either way.
    const closes = Array.from({ length: 31 }, (_, i) => (i % 2 ? 101 : 100))
    expect(usualDailyMove(closes)).toBeCloseTo(1, 1)
  })

  it("won't say from fewer than twenty changes", () => {
    expect(usualDailyMove(Array.from({ length: 20 }, (_, i) => 100 + i))).toBeNull()
  })
})
