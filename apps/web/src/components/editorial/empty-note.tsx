import { cn } from "@/lib/utils"

/**
 * An empty list, said plainly: what will appear here, and the one thing to
 * do about it. A dashed rule marks the space the list will fill.
 */
export function EmptyNote({ title, children, action, className }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("border-y border-dashed border-ink-3/40 px-5 py-9 text-center md:py-11", className)}>
      <p className="font-serif text-[1.1875rem] leading-snug font-semibold">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-2">{children}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
