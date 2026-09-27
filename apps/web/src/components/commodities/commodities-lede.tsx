"use client"

import { useMemo } from "react"
import { COMMODITIES, getInstrument } from "@greencircuits/market/catalog"
import { formatNumber, formatPrice } from "@greencircuits/market/format"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { useQuoteReader, useSession } from "@/lib/stream/hooks"

const GOLD = 300
const CRUDE = 302

/** How a price is quoted, as words after the number: "for 10 grams", "a barrel". */
const PER: Record<string, string> = {
  GOLD: "for 10 grams",
  SILVER: "a kilo",
  CRUDEOIL: "a barrel",
  NATURALGAS: "per million British thermal units",
  COPPER: "a kilo",
  ZINC: "a kilo",
  ALUMINIUM: "a kilo",
}

function move(q: Quote): string {
  const pct = Math.abs(q.changePct)
  if (pct < 0.05) return "unchanged"
  return `${q.changePct > 0 ? "up" : "down"} ${formatNumber(pct, 1)}%`
}

function price(inst: Instrument, q: Quote): string {
  return `₹${formatPrice(q.ltp, inst.tick)} ${PER[inst.symbol] ?? ""}`.trim()
}

/**
 * The standfirst, written from the quotes: gold and crude, which most readers
 * follow, and whichever other commodity moved most.
 */
export function CommoditiesLede() {
  const read = useQuoteReader(8000)
  const { closed } = useSession()
  const text = useMemo(() => {
    const gold = getInstrument(GOLD)!
    const crude = getInstrument(CRUDE)!
    const g = read(GOLD)
    const c = read(CRUDE)
    if (!g || !c) return null
    const verb = closed ? "ended" : "is"
    const when = closed ? ` ${closed}` : ""
    const others = COMMODITIES.filter((i) => i.id !== GOLD && i.id !== CRUDE)
      .map((inst) => ({ inst, q: read(inst.id) }))
      .filter((x): x is { inst: Instrument; q: Quote } => x.q != null)
      .sort((a, b) => Math.abs(b.q.changePct) - Math.abs(a.q.changePct))
    const top = others[0]
    const lead = `Gold ${verb} at ${price(gold, g)}${when}, ${move(g)}, and crude oil at ${price(crude, c)}, ${move(c)}.`
    if (!top || Math.abs(top.q.changePct) < 0.5) return lead
    // "Natural Gas" in a list, "Natural gas" in a sentence.
    const name = top.inst.name.charAt(0) + top.inst.name.slice(1).toLowerCase()
    return `${lead} ${name} moved most, ${move(top.q)} at ${price(top.inst, top.q)}.`
  }, [read, closed])

  return <>{text ?? "Prices for bullion, energy and base metals, in rupees."}</>
}
