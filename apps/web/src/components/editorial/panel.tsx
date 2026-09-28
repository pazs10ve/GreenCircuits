import { cn } from "@/lib/utils"

/** A card without a title bar: for a chart that heads itself with its own figure, or a set of controls. Name it with aria-label. */
export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("min-w-0 rounded-card border border-rule bg-paper p-4 sm:p-5", className)} {...rest}>
      {children}
    </section>
  )
}
