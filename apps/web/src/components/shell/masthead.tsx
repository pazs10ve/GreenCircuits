"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AccountMenu } from "@/components/account/account-menu"
import { Logo } from "@/components/brand/logo"
import { cn } from "@/lib/utils"
import { CommandMenu } from "./command-menu"
import { FeedMarker } from "./feed-marker"
import { SITE_NAV } from "./nav"

export function Masthead() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur-md supports-[backdrop-filter]:bg-paper/80">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-8 px-5">
        <Link href="/" aria-label="GreenCircuits, today's market" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Sections" className="hidden h-full items-stretch gap-7 md:flex">
          {SITE_NAV.map((item) => {
            const active = item.match(pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center border-b-2 pt-0.5 text-[0.9375rem] transition-colors",
                  active ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <CommandMenu />
          <FeedMarker className="hidden lg:flex" />
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}
