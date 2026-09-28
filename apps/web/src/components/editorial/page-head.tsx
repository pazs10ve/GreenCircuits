import { cn } from "@/lib/utils"

/**
 * A page's title, one short line of context under it (a count, a date, what
 * the figures are), and its actions to the right. The page's cards do the
 * explaining; the heading only says where the reader is.
 */
export function PageHead({
  title,
  kicker,
  lede,
  actions,
  className,
}: {
  title: React.ReactNode
  kicker?: React.ReactNode
  lede?: React.ReactNode
  /** Kept for old callers; the line under the title is always small now. */
  serif?: boolean
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-8 gap-y-3", className)}>
      <div className="max-w-[60rem] min-w-0">
        {kicker && <p className="kicker mb-1.5">{kicker}</p>}
        <h1 className="font-serif text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.02em] md:text-[1.875rem]">{title}</h1>
        {lede && <p className="mt-1.5 line-clamp-1 text-[13px] text-ink-3">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
