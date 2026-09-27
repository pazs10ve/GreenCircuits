import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { SITE_NAV } from "./nav"

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-5 py-10 md:grid-cols-[1fr_auto]">
        <div className="max-w-xl space-y-3">
          <Logo />
          <p className="text-sm text-ink-2">
            A project about researching Indian companies and testing investing ideas before risking money on them.
          </p>
          <p className="text-xs leading-relaxed text-ink-3">
            Prices come from a market simulator and company figures are samples, so nothing here describes a real market or
            company. Not investment advice.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-6 text-sm md:flex-col md:gap-2">
          {SITE_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-ink-2 hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
