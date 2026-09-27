"use client"

import { useMarket } from "@/lib/stream/market-context"

/** What the prices behind an experiment were, for its "how this was tested" note. */
export function PricesNote() {
  const { dataset } = useMarket()
  return dataset === "real"
    ? "Prices are real daily closes, adjusted for splits and bonus issues; dividends are left out."
    : "Prices are from the demo market, not real history."
}
