import Link from "next/link"
import { slugify } from "@greencircuits/market/catalog"
import { formatPct } from "@greencircuits/market/format"
import type { CategorySummary } from "@/lib/data/funds"
import { cn } from "@/lib/utils"

/** The categories most people start from: the equity sizes, the flexible one, index funds and a bond category. */
export const FEATURED = ["Large cap", "Mid cap", "Small cap", "Flexi cap", "Equity index", "Corporate bond"]

/** The featured categories as tiles: how the typical fund in each did, a year at a time; a tile opens its category. */
export function CategoryTiles({ categories, selected }: { categories: CategorySummary[]; selected: string }) {
  const tiles = FEATURED.flatMap((name) => categories.filter((c) => c.category === name))
  if (tiles.length < 3) return null
  return (
    <nav aria-label="Main categories" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
      {tiles.map((c) => {
        const years = c.y5 != null ? 5 : 3
        const value = c.y5 ?? c.y3
        const on = c.category === selected
        return (
          <Link
            key={c.category}
            href={`/funds?category=${slugify(c.category)}`}
            scroll={false}
            aria-current={on ? "true" : undefined}
            className={cn(
              "group flex min-w-0 flex-col gap-2 rounded-card border bg-paper p-4 transition-colors",
              on ? "border-ink shadow-[inset_0_0_0_1px_var(--ink)]" : "border-rule hover:border-rule-strong",
            )}
          >
            <span className={cn("truncate text-xs", on ? "font-semibold text-ink" : "text-ink-3 group-hover:text-ink-2")}>{c.category}</span>
            <span className="figure text-[1.5rem] leading-none">{value == null ? "–" : formatPct(value, 1)}</span>
            <span className="truncate text-[11px] text-ink-3">
              Typical, {years} years · {c.schemes} funds
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
