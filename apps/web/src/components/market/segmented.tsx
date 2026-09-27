"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

/** Single-choice segmented control (chart ranges, views). Never deselects. */
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
      variant="outline"
      size="sm"
      spacing={0}
      aria-label={ariaLabel}
      className={cn("bg-background", className)}
    >
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o
        return (
          <ToggleGroupItem key={opt.value} value={opt.value} className="h-6 px-2 text-[11px] data-[state=on]:bg-muted data-[state=on]:text-foreground">
            {opt.label}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
