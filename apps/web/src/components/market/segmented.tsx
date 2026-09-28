"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

/** The choice on a panel: ranges, views, measures. The chosen option sits raised on paper. Never deselects. */
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
      spacing={0}
      aria-label={ariaLabel}
      className={cn("gap-0.5 rounded-control bg-panel p-0.5", className)}
    >
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o
        return (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            className="h-[26px] min-w-0 rounded-[7px] border border-transparent px-2.5 text-[13px] font-medium text-ink-3 shadow-none hover:bg-transparent hover:text-ink data-[state=on]:border-rule-strong data-[state=on]:bg-paper data-[state=on]:font-semibold data-[state=on]:text-ink"
          >
            {opt.label}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
