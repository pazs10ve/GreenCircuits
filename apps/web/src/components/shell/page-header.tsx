import { cn } from "@/lib/utils"

/** Consistent page title block: eyebrow, title, description, actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-3 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">{eyebrow}</div>}
        <h1 className="font-display text-2xl leading-tight font-bold tracking-tight md:text-[1.75rem]">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Titled panel used across the app. Lighter than a Card: a border and a header row. */
export function Panel({
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg border bg-card", className)}>
      {(title || actions) && (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b px-4 py-2">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[13px] font-semibold">{title}</h2>}
            {description && <p className="truncate text-[11px] text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  )
}
