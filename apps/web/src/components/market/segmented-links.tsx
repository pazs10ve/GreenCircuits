import Link from "next/link"
import { cn } from "@/lib/utils"

/** The segmented control's look for choices that are pages: each option is a link, the current one raised on paper. */
export function SegmentedLinks({
  options,
  current,
  className,
  "aria-label": ariaLabel,
}: {
  options: { value: string; label: React.ReactNode; href: string }[]
  current: string
  className?: string
  "aria-label"?: string
}) {
  return (
    <nav aria-label={ariaLabel} className={cn("inline-flex flex-wrap gap-0.5 rounded-control bg-panel p-0.5", className)}>
      {options.map((o) => (
        <Link
          key={o.value}
          href={o.href}
          scroll={false}
          aria-current={o.value === current ? "page" : undefined}
          className={cn(
            "inline-flex h-[26px] items-center rounded-[7px] border px-2.5 text-[13px] transition-colors",
            o.value === current ? "border-rule-strong bg-paper font-semibold text-ink" : "border-transparent font-medium text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  )
}
