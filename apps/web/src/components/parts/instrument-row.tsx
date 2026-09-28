import Link from "next/link"
import type { Route } from "next"
import { cn } from "@/lib/utils"
import { Monogram } from "./monogram"

/**
 * The one instrument row: a monogram, the name, its trend, the price and the
 * move. Lists across the site are built from it, so a reader scans them all
 * the same way.
 */
export function InstrumentRow({
  href,
  mono,
  name,
  sub,
  trend,
  value,
  move,
  className,
}: {
  href: string
  /** Letters for the monogram, usually the symbol; leave out for an index or a currency. */
  mono?: string
  name: React.ReactNode
  sub?: React.ReactNode
  trend?: React.ReactNode
  value?: React.ReactNode
  move: React.ReactNode
  className?: string
}) {
  return (
    <Link href={href as Route} className={cn("group flex min-w-0 items-center gap-3 py-2.5", className)}>
      {mono && <Monogram text={mono} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4">{name}</span>
        {sub && <span className="block truncate text-xs text-ink-3">{sub}</span>}
      </span>
      {trend && <span className="hidden shrink-0 sm:block">{trend}</span>}
      {value != null && <span className="num w-[5.5rem] shrink-0 text-right text-sm">{value}</span>}
      <span className="flex w-16 shrink-0 justify-end">{move}</span>
    </Link>
  )
}
