"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { Search } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { COMMODITIES, CURRENCIES, EQUITIES, INDICES } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"
import { LiveChange } from "@/components/market/price"
import { cn } from "@/lib/utils"
import { SITE_NAV } from "./nav"

const MORE_PAGES = [
  { label: "Watchlists", href: "/watchlists" },
  { label: "Alerts", href: "/alerts" },
  { label: "Settings", href: "/settings" },
]

function hrefFor(inst: Instrument): string {
  return inst.kind === "COMMODITY" ? `/commodities?c=${inst.slug}` : `/stocks/${inst.slug}`
}

/** Site search: companies, indices, commodities and pages. Ctrl K, ⌘K or "/" opens it. */
export function CommandMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  const item = (inst: Instrument, keywords: string) => (
    <CommandItem key={inst.id} value={`${inst.name} ${inst.symbol} ${keywords}`} onSelect={() => go(hrefFor(inst))} className="gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">{inst.name}</span>
        <span className="block text-xs text-ink-3">
          {inst.symbol} · {inst.exchange}
        </span>
      </span>
      <LiveChange id={inst.id} showAbsolute={false} arrow={false} className="text-xs" />
    </CommandItem>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "hidden h-9 w-64 items-center gap-2 rounded-md bg-surface px-3 text-left text-sm text-ink-3 transition-colors hover:bg-surface-2 md:flex",
          className,
        )}
      >
        <Search className="size-4" />
        <span className="flex-1">Search companies…</span>
        <kbd className="rounded border border-rule bg-paper px-1.5 font-sans text-[11px] text-ink-3">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex size-9 items-center justify-center rounded-md text-ink-2 hover:bg-surface md:hidden"
      >
        <Search className="size-5" />
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search companies, indices and pages">
        <CommandInput placeholder="Company, index or symbol" className="text-sm" />
        <CommandList className="max-h-[440px]">
          <CommandEmpty>Nothing matches. Try a company name like “Infosys”.</CommandEmpty>
          <CommandGroup heading="Companies">{EQUITIES.map((e) => item(e, e.sector ?? ""))}</CommandGroup>
          <CommandGroup heading="Indices">{INDICES.filter((i) => i.symbol !== "INDIA VIX").map((i) => item(i, "index"))}</CommandGroup>
          <CommandGroup heading="Commodities and currencies">{[...COMMODITIES, ...CURRENCIES].map((c) => item(c, "mcx currency"))}</CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Pages">
            {[...SITE_NAV.map((n) => ({ label: n.label, href: n.href })), ...MORE_PAGES].map((p) => (
              <CommandItem key={p.href} value={`page ${p.label}`} onSelect={() => go(p.href)} className="py-2 text-sm">
                {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
