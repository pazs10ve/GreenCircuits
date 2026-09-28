"use client"

import { create } from "zustand"
import type { BondRow } from "./bond-math"

export type SolveFor = "price" | "yield"

export interface CalcInputs {
  /** What the calculator works out: the price from a yield, or the yield from a price. */
  solve: SolveFor
  coupon: string
  ytm: string
  price: string
  years: string
  frequency: number
  /** Name of the bond the inputs were loaded from, if any. */
  source: string | null
}

interface CalcState extends CalcInputs {
  set: (patch: Partial<CalcInputs>) => void
  load: (bond: BondRow) => void
  reset: () => void
}

const DEFAULTS: CalcInputs = {
  solve: "price",
  coupon: "7.10",
  ytm: "6.90",
  price: "101.4277",
  years: "10",
  frequency: 2,
  source: null,
}

/**
 * Calculator inputs, shared so a row in the bond screener can load its bond.
 * Not persisted; the server only ever reads the defaults, so first renders match.
 */
export const useBondCalc = create<CalcState>()((set) => ({
  ...DEFAULTS,
  set: (patch) => set(patch),
  // A bond with a price but no yield of its own (it didn't trade today) is loaded to work the yield out.
  load: (bond) =>
    set({
      solve: bond.ytm == null && bond.price != null ? "yield" : "price",
      coupon: String(bond.coupon ?? 0),
      ytm: (bond.ytm ?? 7).toFixed(2),
      price: (bond.price ?? 100).toFixed(4),
      years: bond.yearsLeft.toFixed(2),
      frequency: bond.frequency,
      source: bond.name,
    }),
  reset: () => set(DEFAULTS),
}))
