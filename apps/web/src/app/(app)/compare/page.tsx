import type { Metadata } from "next"
import { CompareView, type CompareFacts } from "@/components/compare/compare-view"
import { MAX_COMPARED } from "@/components/compare/limits"
import { PageHead } from "@/components/editorial/page-head"
import { INDEX, INSTRUMENTS, getInstrument } from "@greencircuits/market/catalog"
import type { Tone } from "@greencircuits/market/research/company"
import { getCompany } from "@/lib/data/company"

export const metadata: Metadata = {
  title: "Compare",
  description: "Stocks, indices, gold and the rupee side by side: each from the same starting point, with companies' scorecards and figures.",
}

/** What to compare, from ?s=INFY,NIFTY50: symbols or page names, in order, as many as fit. */
function resolve(s: string | undefined): number[] {
  if (s === undefined) return [INDEX.NIFTY, INDEX.BANKNIFTY, INDEX.NIFTYIT, 300]
  const wanted = s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)
  const ids = [...new Set(wanted.flatMap((w) => INSTRUMENTS.find((i) => i.symbol.toLowerCase() === w || i.slug === w)?.id ?? []))].slice(0, MAX_COMPARED)
  // One company on its own is compared with the market.
  if (ids.length === 1 && getInstrument(ids[0]!)?.kind !== "INDEX") ids.push(INDEX.NIFTY)
  return ids
}

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const { s } = await searchParams
  const ids = resolve(typeof s === "string" ? s : undefined)
  // The companies' scorecards and figures, from the same source as their own pages.
  const companies = await Promise.all(
    ids.flatMap((id) => {
      const inst = getInstrument(id)
      return inst?.kind === "EQUITY" ? [getCompany(inst).then(({ profile }) => [id, profile] as const)] : []
    }),
  )
  const scores: Record<number, Tone[]> = Object.fromEntries(companies.map(([id, p]) => [id, p.pillars.map((x) => x.tone)]))
  const facts: Record<number, CompareFacts> = Object.fromEntries(
    companies.map(([id, p]) => [id, { pe: p.pe?.current ?? p.f.pe ?? null, roe: p.f.roe ?? null, growth: p.f.profitCagr3y ?? null, divYield: p.f.dividendYield ?? null }]),
  )
  const n = ids.length
  return (
    <div className="page pt-6 pb-10">
      <PageHead title="Compare" lede={n ? `${n} side by side, from the same starting point` : "Up to six stocks, indices, commodities or currencies, side by side"} />
      <CompareView initial={ids} scores={scores} facts={facts} />
    </div>
  )
}
