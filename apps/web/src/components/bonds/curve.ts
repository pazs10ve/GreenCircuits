import type { CurvePoint } from "@greencircuits/market/reference"
import type { BondRow } from "./bond-math"

/** The curve's yield at any term, straight between its points, and flat beyond its ends. */
export function curveAt(curve: CurvePoint[], years: number): number {
  if (years <= curve[0]!.tenor) return curve[0]!.today
  for (let i = 1; i < curve.length; i++) {
    const [a, b] = [curve[i - 1]!, curve[i]!]
    if (years <= b.tenor) return a.today + ((b.today - a.today) * (years - a.tenor)) / (b.tenor - a.tenor)
  }
  return curve.at(-1)!.today
}

/**
 * How much more than the government a set of bonds pays, in basis points, on
 * average: each bond's yield today less the curve's at its term. Only bonds
 * that traded today and reach nearly as far as the curve's short end count;
 * null with fewer than three.
 */
export function spreadOver(curve: CurvePoint[], rows: BondRow[]): number | null {
  const priced = rows.filter((b) => b.ytm != null && b.fresh && b.yearsLeft >= curve[0]!.tenor * 0.8)
  return priced.length >= 3 ? (priced.reduce((s, b) => s + (b.ytm! - curveAt(curve, b.yearsLeft)), 0) / priced.length) * 100 : null
}
