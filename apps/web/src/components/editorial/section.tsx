import { cn } from "@/lib/utils"

/** A newspaper-style section: an ink rule, a serif title, an optional line of context and an action. */
export function Section({
  id,
  title,
  description,
  action,
  className,
  children,
}: {
  id?: string
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn("scroll-mt-20 border-t border-ink pt-4", className)}>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="space-y-1">
          <h2 id={id ? `${id}-title` : undefined} className="font-serif text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          {description && <p className="max-w-[42em] text-sm text-ink-2">{description}</p>}
        </div>
        {action && <div className="text-sm">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** A quiet text link with an arrow, for "see more" actions. */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="link inline-flex items-center gap-1 text-sm font-medium">
      {children}
      <span aria-hidden="true">→</span>
    </a>
  )
}
