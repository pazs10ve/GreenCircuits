"use client"

import Link from "next/link"
import { useState } from "react"
import { X } from "lucide-react"
import { WELCOME_COOKIE } from "./welcome-cookie"

const STEPS = [
  { href: "/stocks", label: "Look up a company" },
  { href: "/lab", label: "Test an idea" },
  { href: "/portfolio", label: "Add your holdings" },
]

/** A line for a first visit: what the site is for, and where to start. */
export function Welcome() {
  const [open, setOpen] = useState(true)
  if (!open) return null
  const dismiss = () => {
    document.cookie = `${WELCOME_COOKIE}=read; max-age=${60 * 60 * 24 * 365}; path=/; samesite=lax`
    setOpen(false)
  }
  return (
    <aside aria-label="About GreenCircuits" className="mt-5 flex items-start gap-3 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-6 gap-y-1.5">
        <p className="text-[0.9375rem] font-medium">Check an investing idea against the evidence before you put money on it.</p>
        <nav aria-label="Where to start" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {STEPS.map((s) => (
            <Link key={s.href} href={s.href} className="link group inline-flex items-center gap-1 font-medium">
              {s.label}
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          ))}
        </nav>
      </div>
      <button type="button" onClick={dismiss} aria-label="Hide this note" className="-m-1 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-paper hover:text-ink">
        <X className="size-4" />
      </button>
    </aside>
  )
}
