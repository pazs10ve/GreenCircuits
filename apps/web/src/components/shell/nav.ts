import { Briefcase, Compass, FlaskConical, Newspaper, type LucideIcon } from "lucide-react"

export interface SiteNavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Whether a pathname belongs to this section. */
  match: (pathname: string) => boolean
}

const under = (...prefixes: string[]) => (pathname: string) => prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))

/** Four sections, organised around what you came to do rather than asset classes. */
export const SITE_NAV: SiteNavItem[] = [
  { label: "Today", href: "/", icon: Newspaper, match: (p) => p === "/" },
  { label: "Explore", href: "/stocks", icon: Compass, match: under("/stocks", "/fo", "/screener", "/ipos", "/bonds", "/commodities") },
  { label: "Lab", href: "/lab", icon: FlaskConical, match: under("/lab") },
  { label: "Portfolio", href: "/portfolio", icon: Briefcase, match: under("/portfolio", "/watchlists", "/alerts") },
]
