import type { Instrument } from "@greencircuits/market/types"

/** "₹ / 10 g" → "₹ per 10 g". */
export const unitWords = (inst: Instrument) => (inst.unit ?? "").replace(" / ", " per ")
