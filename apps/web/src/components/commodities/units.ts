import type { Instrument } from "@greencircuits/market/types"

/** "₹ / 10 g" → "₹ per 10 g". */
export const unitWords = (inst: Instrument) => (inst.unit ?? "").replace(" / ", " per ")

/** "Natural Gas" in a list reads as "Natural gas" in the site's sentence case. */
export const commodityName = (inst: Instrument) => inst.name.charAt(0) + inst.name.slice(1).toLowerCase()
