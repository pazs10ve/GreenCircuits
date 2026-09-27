"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { signOut, useAccountsAvailable, useMe } from "@/lib/account/client"
import { initials } from "@/lib/stores/preferences"

/** "Sign in" for visitors; the account's initials, with a menu, once signed in. Hidden in demo mode. */
export function AccountMenu() {
  const available = useAccountsAvailable()
  const { data: me, isPending } = useMe()
  const pathname = usePathname()
  if (!available) return null
  if (isPending) return <span className="size-8" aria-hidden="true" />
  if (!me || me.anonymous) {
    const next = pathname && pathname !== "/" && !pathname.startsWith("/sign") ? `?next=${encodeURIComponent(pathname)}` : ""
    return (
      <Link href={`/signin${next}`} className="text-[0.9375rem] whitespace-nowrap text-ink-2 hover:text-ink">
        Sign in
      </Link>
    )
  }
  const label = me.name || me.email || "Your account"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Your account: ${label}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold tracking-wide text-paper outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2"
        >
          {initials(label)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          {me.name && <span className="block truncate text-sm font-medium text-ink">{me.name}</span>}
          <span className="block truncate text-xs text-ink-3">{me.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">Your account</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account#feed">Tune your feed</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
