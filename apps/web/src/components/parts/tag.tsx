import { FlaskConical, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** What each tone means is set in globals.css: brand for the lab, bench for a benchmark, attn for things that want you. */
const TONES = {
  neutral: "bg-surface-2 text-ink-2",
  brand: "bg-brand-soft text-brand",
  up: "bg-up-soft text-up",
  down: "bg-down-soft text-down",
  bench: "bg-bench-soft text-bench",
  attn: "bg-attn-soft text-attn",
} as const

export type TagTone = keyof typeof TONES

/** A short label on a tint: a category, a status, a verdict. */
export function Tag({ tone = "neutral", icon: Icon, children, className }: { tone?: TagTone; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-px text-xs font-semibold whitespace-nowrap", TONES[tone], className)}>
      {Icon && <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />}
      {children}
    </span>
  )
}

/** A lab result, drawn the same wherever it appears: on Today, a company's page, the lab. */
export function Result({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Tag tone="brand" icon={FlaskConical} className={className}>
      {children}
    </Tag>
  )
}
