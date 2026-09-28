import type { Instrument } from "@greencircuits/market/types"

/** "₹ / 10 g" → "₹ per 10 g". */
export const unitWords = (inst: Instrument) => (inst.unit ?? "").replace(" / ", " per ")

/** "Natural Gas" in a list reads as "Natural gas" in the site's sentence case. */
export const commodityName = (inst: Instrument) => inst.name.charAt(0) + inst.name.slice(1).toLowerCase()

/**
 * How each is quoted abroad, in dollars, and how many of MCX's unit make that
 * one: gold and silver by the troy ounce, copper by the pound, zinc and
 * aluminium by the tonne, oil by the barrel and gas by the mmBtu as here.
 */
const ABROAD: Record<string, { per: string; factor: number }> = {
  GOLD: { per: "an ounce", factor: 31.1034768 / 10 },
  SILVER: { per: "an ounce", factor: 31.1034768 / 1000 },
  CRUDEOIL: { per: "a barrel", factor: 1 },
  NATURALGAS: { per: "per mmBtu", factor: 1 },
  COPPER: { per: "a pound", factor: 0.45359237 },
  ZINC: { per: "a tonne", factor: 1000 },
  ALUMINIUM: { per: "a tonne", factor: 1000 },
}

/** A price in rupees by MCX's unit, as dollars by the unit quoted abroad; null without a rate or a known unit. */
export function inDollars(inst: Instrument, rupees: number, rupeesPerDollar: number | undefined): { value: number; per: string } | null {
  const abroad = ABROAD[inst.symbol]
  if (!abroad || !rupeesPerDollar || rupeesPerDollar <= 0) return null
  return { value: (rupees / rupeesPerDollar) * abroad.factor, per: abroad.per }
}

/** How many ounces of silver one of gold buys, from MCX's prices: gold by 10 grams, silver by the kilo. */
export const goldSilverRatio = (goldPer10g: number, silverPerKg: number) => (goldPer10g * 100) / silverPerKg

/** A year's change seen in dollars: the rupee change, less what the rupee itself did against the dollar. */
export const inDollarTerms = (rupeeChangePct: number, rupeesPerDollarThen: number, rupeesPerDollarNow: number) =>
  ((1 + rupeeChangePct / 100) / (rupeesPerDollarNow / rupeesPerDollarThen) - 1) * 100
