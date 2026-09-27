import { cn } from "@/lib/utils"

/**
 * A page's headline and standfirst. Reading pages (IPOs, bonds, commodities)
 * set the standfirst in the serif, like the brief; tools (the screener,
 * watchlists, alerts) in the sans, like the lab's builder.
 */
export function PageHead({
  title,
  lede,
  serif = false,
  actions,
  className,
}: {
  title: React.ReactNode
  lede?: React.ReactNode
  serif?: boolean
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("mt-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-5 md:mt-10", className)}>
      <div className="max-w-[46rem] min-w-0">
        <h1 className="font-serif text-[2.375rem] leading-[1.04] font-semibold tracking-[-0.02em] md:text-[3.25rem]">{title}</h1>
        {lede && (
          <p className={cn("mt-4 text-ink-2", serif ? "font-serif text-[1.1875rem] leading-snug md:text-[1.3125rem]" : "text-[1.0625rem] leading-relaxed")}>
            {lede}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
