import Link from "next/link"
import { slugify } from "@greencircuits/market/catalog"
import { FUND_CATEGORIES, type FundReturns } from "@greencircuits/market/funds"
import type { CategorySummary, SchemeRow } from "@/lib/data/funds"
import { cn } from "@/lib/utils"
import { CATEGORY_NOTES } from "./categories"
import { CategoryStrip } from "./category-strip"
import { PERIODS, returnsOf } from "./returns"
import { SchemeTable } from "./scheme-table"

/** Mutual funds: categories down the side, the chosen one's schemes and how they did. */
export function MutualFunds({
  categories,
  category,
  schemes,
  benchmark,
  real,
}: {
  categories: CategorySummary[]
  category: string
  schemes: SchemeRow[]
  benchmark: { name: string; returns: FundReturns } | null
  real: boolean
}) {
  const present = new Map(categories.map((c) => [c.category, c]))
  const groups = FUND_CATEGORIES.map((g) => ({ ...g, categories: g.categories.filter((c) => present.has(c)) })).filter((g) => g.categories.length > 0)
  // The longest span most of the category has lived through: five years, else three, else one.
  const period = [PERIODS[2], PERIODS[1], PERIODS[0]].find((p) => returnsOf(schemes, p.key).length >= Math.max(3, schemes.length / 2)) ?? PERIODS[0]

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav
        aria-label="Fund categories"
        className="scrollbar-thin min-w-0 rounded-card border border-rule bg-paper p-2 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto"
      >
        {groups.map((g) => (
          <div key={g.assetClass} className="mb-3 last:mb-0">
            <h3 className="px-2 pt-1.5 pb-1 text-xs font-medium text-ink-3">{g.assetClass === "Solution" ? "For a goal" : g.assetClass}</h3>
            <ul>
              {g.categories.map((c) => (
                <li key={c}>
                  <Link
                    href={`/funds?category=${slugify(c)}`}
                    scroll={false}
                    aria-current={c === category ? "page" : undefined}
                    className={cn(
                      "flex items-baseline justify-between gap-3 rounded-panel px-2 py-1.5 text-sm transition-colors",
                      c === category ? "bg-panel font-semibold text-ink" : "text-ink-2 hover:bg-panel hover:text-ink",
                    )}
                  >
                    <span className="truncate">{c}</span>
                    <span className="num text-xs text-ink-3">{present.get(c)!.schemes}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <section className="min-w-0 rounded-card border border-rule bg-paper p-4 sm:p-5" aria-labelledby="category-title">
        <h2 id="category-title" className="font-serif text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">
          {category}
        </h2>
        {CATEGORY_NOTES[category] && <p className="mt-1 text-[13px] text-ink-3">{CATEGORY_NOTES[category]}</p>}
        <div className="mt-5 rounded-panel bg-panel px-4 pt-3 pb-3.5">
          {returnsOf(schemes, period.key).length >= 3 ? (
            <CategoryStrip schemes={schemes} period={period} index={benchmark ? { name: benchmark.name, value: benchmark.returns[period.key] } : null} />
          ) : (
            <p className="text-[13px] text-ink-3">{schemes.length} funds, most too new to judge on more than a year.</p>
          )}
        </div>
        <div className="mt-5">
          <SchemeTable schemes={schemes} />
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Direct plans, growth option. Returns are on the NAV, to its latest date{real ? ", from AMFI's figures" : ""}; beyond a year they are a year&apos;s, compounded.
          {benchmark ? " An index's level leaves out the dividends its companies pay, which a fund collects." : ""}
          {real ? "" : " In the demo the schemes are real but their NAV history is simulated from the demo market."}
        </p>
      </section>
    </div>
  )
}
