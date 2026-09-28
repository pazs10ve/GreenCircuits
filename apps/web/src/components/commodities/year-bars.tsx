import type { Route } from "next"
import Link from "next/link"
import { Move } from "@/components/parts/move"
import { Tag } from "@/components/parts/tag"
import { cn } from "@/lib/utils"

/**
 * A year's change for each commodity, best first, as bars either side of
 * zero, with shares (the Nifty 50) among them in the benchmark's blue.
 */
export function YearBars({ rows }: { rows: { id: number; name: string; href: string; pct: number; bench?: boolean }[] }) {
  const sorted = [...rows].sort((a, b) => b.pct - a.pct)
  const lo = Math.min(0, ...sorted.map((r) => r.pct))
  const hi = Math.max(0, ...sorted.map((r) => r.pct))
  const span = hi - lo || 1
  const zero = (-lo / span) * 100
  return (
    <ul className="divide-y divide-rule">
      {sorted.map((r) => (
        <li key={r.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-4 py-2 first:pt-0 last:pb-0">
          <Link href={r.href as Route} className="flex min-w-0 items-center gap-1.5 text-sm font-semibold decoration-rule-strong hover:underline hover:underline-offset-4">
            <span className="truncate">{r.name}</span>
            {r.bench && <Tag tone="bench">Shares</Tag>}
          </Link>
          <span className="relative h-2" aria-hidden="true">
            <span className="absolute -inset-y-1.5 w-px bg-rule-strong" style={{ left: `${zero}%` }} />
            <span
              className={cn("absolute inset-y-0 rounded-[3px]", r.bench ? "bg-bench" : r.pct >= 0 ? "bg-up/80" : "bg-down/80")}
              style={r.pct >= 0 ? { left: `${zero}%`, width: `${(r.pct / span) * 100}%` } : { right: `${100 - zero}%`, width: `${(-r.pct / span) * 100}%` }}
            />
          </span>
          <span className="text-right">
            <Move value={r.pct} digits={1} />
          </span>
        </li>
      ))}
    </ul>
  )
}
