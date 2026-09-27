"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { direction, formatPct, formatPrice, formatSigned } from "@greencircuits/market/format"
import { useQuote } from "@/lib/stream/hooks"
import { getInstrument } from "@greencircuits/market/catalog"
import { Skeleton } from "@/components/ui/skeleton"
import { usePreferences } from "@/lib/stores/preferences"

/**
 * Briefly tint the text when the value ticks (Web Animations API, no re-render).
 * Off by default: calm screens, with flashing kept for lists you scan.
 */
function useFlash<T extends HTMLElement>(value: number | undefined) {
  const ref = useRef<T>(null)
  const prev = useRef<number | undefined>(value)
  useEffect(() => {
    const el = ref.current
    const before = prev.current
    prev.current = value
    if (!el || value == null || before == null || value === before) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    if (!usePreferences.getState().flashPrices) return
    const color = value > before ? "var(--up)" : "var(--down)"
    el.animate([{ color }, { color: "currentColor" }], { duration: 700, easing: "ease-out" })
  }, [value])
  return ref
}

export function Price({
  value,
  tick = 0.05,
  className,
  flash = false,
}: {
  value: number | undefined
  tick?: number
  className?: string
  flash?: boolean
}) {
  const ref = useFlash<HTMLSpanElement>(flash ? value : undefined)
  if (value == null) return <Skeleton className={cn("inline-block h-[1em] w-14 align-middle", className)} />
  return (
    <span ref={ref} className={cn("num", className)}>
      {formatPrice(value, tick)}
    </span>
  )
}

export function Change({
  change,
  pct,
  tick = 0.05,
  className,
  showAbsolute = true,
  arrow = false,
}: {
  change: number | undefined
  pct: number | undefined
  tick?: number
  className?: string
  showAbsolute?: boolean
  arrow?: boolean
}) {
  if (pct == null) return <Skeleton className={cn("inline-block h-[1em] w-16 align-middle", className)} />
  const dir = direction(pct)
  const decimals = tick < 0.01 ? 4 : 2
  return (
    <span
      className={cn(
        "num inline-flex items-baseline gap-1.5 whitespace-nowrap",
        dir === "up" && "text-up",
        dir === "down" && "text-down",
        dir === "flat" && "text-ink-2",
        className,
      )}
    >
      {arrow && dir !== "flat" && (
        <span aria-hidden="true" className="text-[0.75em]">
          {dir === "up" ? "▲" : "▼"}
        </span>
      )}
      {showAbsolute && change != null && <span>{formatSigned(change, decimals)}</span>}
      <span>{formatPct(pct)}</span>
    </span>
  )
}

/** A live last-traded price for an instrument id. */
export function LivePrice({ id, className, flash = false }: { id: number; className?: string; flash?: boolean }) {
  const q = useQuote(id)
  const inst = getInstrument(id)
  return <Price value={q?.ltp} tick={inst?.tick} className={className} flash={flash} />
}

export function LiveChange({
  id,
  className,
  showAbsolute = true,
  arrow = false,
}: {
  id: number
  className?: string
  showAbsolute?: boolean
  arrow?: boolean
}) {
  const q = useQuote(id)
  const inst = getInstrument(id)
  return <Change change={q?.change} pct={q?.changePct} tick={inst?.tick} className={className} showAbsolute={showAbsolute} arrow={arrow} />
}

/** Percent change on a soft tint, for dense lists. */
export function ChangePill({ pct, className }: { pct: number | undefined; className?: string }) {
  if (pct == null) return <Skeleton className={cn("h-5 w-14 rounded", className)} />
  const dir = direction(pct)
  return (
    <span
      className={cn(
        "num inline-flex h-6 items-center justify-end rounded px-1.5 text-[13px]",
        dir === "up" && "bg-up-soft text-up",
        dir === "down" && "bg-down-soft text-down",
        dir === "flat" && "bg-surface text-ink-2",
        className,
      )}
    >
      {formatPct(pct)}
    </span>
  )
}
