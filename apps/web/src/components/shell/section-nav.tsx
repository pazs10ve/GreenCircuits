"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

interface Item {
  label: string
  href: string
  /** Paths that belong to the item besides its own. */
  also?: string[]
}

const SECTIONS: Record<"explore" | "portfolio", { label: string; items: Item[] }> = {
  explore: {
    label: "Explore",
    items: [
      { label: "Stocks", href: "/stocks" },
      { label: "Screener", href: "/screener" },
      { label: "F&O", href: "/fo" },
      { label: "IPOs", href: "/ipos" },
      { label: "Bonds", href: "/bonds" },
      { label: "Commodities", href: "/commodities" },
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

/** The pages of a section, under the masthead: a newspaper's section front, as a row of links. */
export function SectionNav({ section }: { section: keyof typeof SECTIONS }) {
  const pathname = usePathname()
  const { label, items } = SECTIONS[section]
  return (
    <nav aria-label={label} className="no-scrollbar -mx-5 overflow-x-auto px-5">
      <ul className="flex min-w-max gap-6 border-b border-rule">
        {items.map((item) => {
          const active = within(pathname, item.href) || item.also?.some((p) => within(pathname, p))
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block border-b-2 pb-2.5 text-[0.9375rem] transition-colors",
                  active ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink",
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
