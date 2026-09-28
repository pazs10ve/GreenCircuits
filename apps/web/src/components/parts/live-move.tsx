"use client"

import { useQuote } from "@/lib/stream/hooks"
import { Move } from "./move"

/** An instrument's move today, as the prices come in. */
export function LiveMove({ id, size, className }: { id: number; size?: "sm" | "md"; className?: string }) {
  const q = useQuote(id)
  return <Move value={q?.changePct} size={size} className={className} />
}
