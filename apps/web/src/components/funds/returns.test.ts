import { describe, expect, it } from "vitest"
import type { SchemeRow } from "@/lib/data/funds"
import { leaderOf, median, ordinal, returnsOf } from "./returns"

const scheme = (code: number, y3: number | null, y5: number | null): SchemeRow => ({
  code,
  name: `Fund ${code}`,
  amc: "Sample Mutual Fund",
  assetClass: "Equity",
  category: "Flexi cap",
  nav: 10,
  navDate: "2026-09-25",
  launchedOn: null,
  y1: null,
  y3,
  y5,
  y10: null,
})

describe("median", () => {
  it("takes the middle value, or the mean of the middle two", () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it("has nothing to say about no values", () => {
    expect(median([])).toBeNull()
  })
})

describe("ordinal", () => {
  it("writes ranks the way they're read", () => {
    expect([1, 2, 3, 4, 10].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "10th"])
    expect([21, 22, 23, 101].map(ordinal)).toEqual(["21st", "22nd", "23rd", "101st"])
  })

  it("keeps the teens as th", () => {
    expect([11, 12, 13, 111, 112].map(ordinal)).toEqual(["11th", "12th", "13th", "111th", "112th"])
  })
})

describe("returnsOf", () => {
  it("leaves out the funds too new to have a return over the span", () => {
    expect(returnsOf([scheme(1, 12, null), scheme(2, 8, 9), scheme(3, null, null)], "y3")).toEqual([12, 8])
  })
})

describe("leaderOf", () => {
  it("picks on five years when most of the category has them", () => {
    const leader = leaderOf("Flexi cap", [scheme(1, 30, 14), scheme(2, 12, 18), scheme(3, 10, 11), scheme(4, 9, 12)])
    expect(leader).toMatchObject({ key: "y5", typical: 13 })
    expect(leader?.scheme.code).toBe(2)
  })

  it("falls back to three years in a young category", () => {
    const leader = leaderOf("Flexi cap", [scheme(1, 30, null), scheme(2, 12, null), scheme(3, 10, 11), scheme(4, 9, null)])
    expect(leader).toMatchObject({ key: "y3", typical: 11 })
    expect(leader?.scheme.code).toBe(1)
  })

  it("names no leader among fewer than three funds", () => {
    expect(leaderOf("Flexi cap", [scheme(1, 30, 14), scheme(2, 12, 18)])).toBeNull()
  })
})
