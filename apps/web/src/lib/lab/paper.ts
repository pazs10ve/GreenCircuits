import { EQUITIES, INDICES, getInstrument } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"
import { COST_PRESETS, orderCharges, type Charges, type CostModel } from "./costs"

/**
 * Paper-trading rules shared by the store and the order ticket. Index
 * instruments trade as near-month futures priced at the simulated index level
 * (no basis), in lots.
 */

export type PaperProduct = "CNC" | "MIS" | "NRML"
export type PaperSide = "BUY" | "SELL"

/** Tradable instruments: NSE equities and F&O-enabled indices (as futures). */
export const PAPER_FUTURES: Instrument[] = INDICES.filter((i) => i.isFo && i.lot)
export const PAPER_EQUITIES: Instrument[] = EQUITIES

export function isFuture(inst: Instrument | undefined): boolean {
  return inst?.kind === "INDEX"
}

export function productsFor(inst: Instrument | undefined): PaperProduct[] {
  return isFuture(inst) ? ["NRML", "MIS"] : ["CNC", "MIS"]
}

export const PRODUCT_HINT: Record<PaperProduct, string> = {
  CNC: "Delivery, held overnight",
  MIS: "Intraday, square off by 15:20",
  NRML: "F&O, carried to expiry",
}

/**
 * Funds blocked per rupee of exposure: full value for delivery, 20% for
 * intraday equity (5× leverage), about 12% SPAN plus exposure for index futures.
 */
export function marginRate(inst: Instrument, product: PaperProduct): number {
  if (isFuture(inst)) return 0.12
  return product === "MIS" ? 0.2 : 1
}

export function costModelFor(inst: Instrument, product: PaperProduct): CostModel {
  if (isFuture(inst)) return COST_PRESETS.futures.model
  return product === "MIS" ? COST_PRESETS.intraday.model : COST_PRESETS.delivery.model
}

export function chargesFor(inst: Instrument, product: PaperProduct, side: PaperSide, qty: number, price: number): Charges {
  return orderCharges(costModelFor(inst, product), side, qty * price)
}

/** "NIFTY 50 FUT" for index futures, the symbol otherwise. */
export function paperSymbol(id: number): string {
  const inst = getInstrument(id)
  if (!inst) return "?"
  return isFuture(inst) ? `${inst.symbol} FUT` : inst.symbol
}

export function paperHref(id: number): string {
  const inst = getInstrument(id)
  return inst ? `/stocks/${inst.slug}` : "/markets"
}
