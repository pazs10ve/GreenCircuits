"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

interface Item {
  label: string
  href: string
  /** Where the item's own pages start, when that isn't its link. */
  also?: string[]
}

const SECTIONS: Record<"markets" | "lab" | "portfolio", { label: string; items: Item[] }> = {
  markets: {
    label: "Markets",
    items: [
      { label: "Overview", href: "/markets" },
      { label: "Stocks", href: "/stocks" },
      { label: "Screener", href: "/screener" },
      { label: "Compare", href: "/compare" },
      { label: "Funds", href: "/funds" },
      { label: "Bonds", href: "/bonds" },
      { label: "Commodities", href: "/commodities" },
      { label: "F&O", href: "/fo" },
      { label: "IPOs", href: "/ipos" },
    ],
  },
  lab: {
    label: "Lab",
    items: [
      { label: "Overview", href: "/lab" },
      { label: "Your tests", href: "/lab/runs" },
      { label: "New test", href: "/lab/new" },
    ],
  },
  portfolio: {
    label: "Portfolio",
    items: [
      { label: "Holdings", href: "/portfolio" },
      { label: "Watchlists", href: "/watchlists" },
      { label: "Alerts", href: "/alerts" },
    ],
  },
}

const within = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`)

/** Which section's bar a page shows. A company's or a fund's own page has its own tabs, and no bar. */
function sectionOf(pathname: string): keyof typeof SECTIONS | null {
  if (/^\/(stocks|funds)\/[^/]+/.test(pathname)) return null
  for (const key of Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]) {
    if (SECTIONS[key].items.some((i) => within(pathname, i.href))) return key
  }
  return null
}

/** The pages of the section you're in, as tabs across the full width under the masthead. */
export function SectionBar() {
  const pathname = usePathname()
  const section = sectionOf(pathname)
  if (!section) return null
  const { label, items } = SECTIONS[section]
  // The most specific match wins: /lab/runs/… is "Your tests", not "Overview".
  const active = items.filter((i) => within(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0]
  return (
    <nav aria-label={label} className="border-b border-rule bg-paper">
      <ul className="page no-scrollbar flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const on = item === active
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href as Route}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "-mb-px flex h-11 items-center border-b-2 px-3 text-sm transition-colors",
                  on ? "border-ink font-semibold text-ink" : "border-transparent font-medium text-ink-3 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
