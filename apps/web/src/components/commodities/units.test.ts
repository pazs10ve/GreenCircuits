import { describe, expect, it } from "vitest"
import type { Instrument } from "@greencircuits/market/types"
import { goldSilverRatio, inDollarTerms, inDollars } from "./units"

const commodity = (symbol: string) => ({ symbol }) as Instrument

describe("inDollars", () => {
  it("turns gold by 10 grams in rupees into dollars an ounce", () => {
    const gold = inDollars(commodity("GOLD"), 100_000, 88)!
    expect(gold.per).toBe("an ounce")
    expect(gold.value).toBeCloseTo((100_000 / 88) * 3.11034768, 6)
  })

  it("uses the unit quoted abroad for each", () => {
    expect(inDollars(commodity("CRUDEOIL"), 5_500, 88)).toEqual({ value: 62.5, per: "a barrel" })
    expect(inDollars(commodity("COPPER"), 880, 88)!.value).toBeCloseTo(4.5359237, 6)
    expect(inDollars(commodity("ZINC"), 264, 88)).toEqual({ value: 3000, per: "a tonne" })
  })

  it("gives nothing without a rate or for a commodity it doesn't know", () => {
    expect(inDollars(commodity("GOLD"), 100_000, undefined)).toBeNull()
    expect(inDollars(commodity("GOLD"), 100_000, 0)).toBeNull()
    expect(inDollars(commodity("COTTON"), 60_000, 88)).toBeNull()
  })
})

describe("goldSilverRatio", () => {
  it("counts the ounces of silver an ounce of gold buys", () => {
    expect(goldSilverRatio(120_000, 150_000)).toBe(80)
  })
})

describe("inDollarTerms", () => {
  it("takes out what the rupee did", () => {
    expect(inDollarTerms(10, 80, 88)).toBeCloseTo(0)
    expect(inDollarTerms(0, 88, 80)).toBeCloseTo(10)
    expect(inDollarTerms(21, 100, 110)).toBeCloseTo(10)
  })
})
