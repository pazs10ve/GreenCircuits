import Link from "next/link"
import type { Route } from "next"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { InfoTip } from "./info-tip"

/**
 * A module of a page: a card with a short title, its content, and room for
 * an action. How its figures are worked out sits behind the ⓘ, so the card
 * leads with what it shows; a `hint` of a few words can sit beside the title
 * when the card can't be read without it.
 */
export function Section({
  id,
  title,
  kicker,
  brand = false,
  size = "default",
  description,
  hint,
  action,
  className,
  children,
}: {
  id?: string
  title: React.ReactNode
  /** A small label over the title: which part of the site is speaking ("From the lab"). */
  kicker?: React.ReactNode
  /** The kicker in the brand's green: for the lab's findings. */
  brand?: boolean
  /** "rail" for a narrow column: tighter inside. */
  size?: "default" | "rail"
  /** How the card's figures are worked out; behind the ⓘ. */
  description?: React.ReactNode
  /** A few words beside the title, always shown. */
  hint?: React.ReactNode
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn("min-w-0 scroll-mt-20 rounded-card border border-rule bg-paper", size === "rail" ? "p-4" : "p-4 sm:p-5", className)}
    >
      <header className="mb-4 flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {kicker && <p className={cn("kicker mb-1", brand && "text-brand")}>{kicker}</p>}
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 id={id ? `${id}-title` : undefined} className="truncate text-sm leading-snug font-semibold">
              {title}
            </h2>
            {description && <InfoTip label={typeof title === "string" ? `About ${title.toLowerCase()}` : "About this"}>{description}</InfoTip>}
            {hint && <span className="hidden truncate text-[13px] text-ink-3 sm:inline">{hint}</span>}
          </div>
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">{action}</div>}
      </header>
      {children}
    </section>
  )
}

/** A quiet link at a card's corner, for "see all" and "open". */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href as Route} className="group inline-flex items-center gap-0.5 text-[13px] font-semibold text-ink-2 hover:text-ink">
      {children}
      <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  )
}
