import { describe, expect, it } from "vitest"
import type { CurvePoint } from "@greencircuits/market/reference"
import type { BondRow } from "./bond-math"
import { curveAt, spreadOver } from "./curve"

const curve: CurvePoint[] = [
  { tenor: 1, today: 6, monthAgo: null, yearAgo: null },
  { tenor: 5, today: 6.4, monthAgo: null, yearAgo: null },
  { tenor: 10, today: 7, monthAgo: null, yearAgo: null },
]

const bond = (yearsLeft: number, ytm: number | null, fresh = true) => ({ yearsLeft, ytm, fresh }) as BondRow

describe("curveAt", () => {
  it("reads the curve at its points and straight between them", () => {
    expect(curveAt(curve, 5)).toBe(6.4)
    expect(curveAt(curve, 3)).toBeCloseTo(6.2)
    expect(curveAt(curve, 7.5)).toBeCloseTo(6.7)
  })

  it("stays flat beyond either end", () => {
    expect(curveAt(curve, 0.25)).toBe(6)
    expect(curveAt(curve, 30)).toBe(7)
  })
})

describe("spreadOver", () => {
  it("averages what each bond pays over the curve at its term, in basis points", () => {
    expect(spreadOver(curve, [bond(5, 6.9), bond(10, 7.4), bond(3, 6.5)])).toBeCloseTo(40)
  })

  it("counts only bonds that traded today and reach the curve's short end", () => {
    const rows = [bond(5, 6.9), bond(10, 7.4), bond(3, 6.5), bond(5, 9, false), bond(0.5, 9)]
    expect(spreadOver(curve, rows)).toBeCloseTo(40)
  })

  it("says nothing on fewer than three bonds", () => {
    expect(spreadOver(curve, [bond(5, 6.9), bond(10, 7.4), bond(3, null)])).toBeNull()
  })
})
