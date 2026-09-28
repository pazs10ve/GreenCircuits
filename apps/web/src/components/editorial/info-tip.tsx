"use client"

import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * The explanation behind a figure or a section, one tap away instead of on
 * the page: the page shows the numbers, and the reasoning is there for
 * whoever wants it.
 */
export function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-panel hover:text-ink", className)}
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 text-sm leading-relaxed text-ink-2">
        {children}
      </PopoverContent>
    </Popover>
  )
}
