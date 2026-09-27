"use client"

import { getInstrument } from "@greencircuits/market/catalog"
import { companyLede, type PeHistory } from "@greencircuits/market/research/company"
import { useQuote } from "@/lib/stream/hooks"

/** The company's one-paragraph summary, written from the live price so it agrees with the figure below it. */
export function CompanyLede({ id, high52, pe, growth }: { id: number; high52: number; pe: PeHistory | null; growth: number }) {
  const inst = getInstrument(id)!
  const q = useQuote(id)
  const price = q?.ltp ?? inst.prevClose
  return (
    <p className="mt-6 max-w-[40em] font-serif text-[1.1875rem] leading-relaxed text-ink-2 md:text-[1.3125rem]">
      {companyLede(inst, price, Math.max(high52, q?.high ?? 0), { pe, f: { profitCagr3y: growth } })}
    </p>
  )
}
