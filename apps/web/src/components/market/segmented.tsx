"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

/** Single-choice control (chart ranges, views), styled like the price chart's ranges. Never deselects. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: readonly (T | { value: T; label: React.ReactNode })[]
  className?: string
  "aria-label"?: string
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      size="sm"
      spacing={1}
      aria-label={ariaLabel}
      className={cn("gap-1", className)}
    >
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o
        return (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            className="h-8 rounded-md px-2.5 text-sm text-ink-2 hover:bg-surface hover:text-ink data-[state=on]:bg-ink data-[state=on]:text-paper"
          >
            {opt.label}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
