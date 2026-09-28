import { cn } from "@/lib/utils"

/** Two letters on a neutral tile, standing in for a logo: calm, and the same for every company. */
export function Monogram({ text, size = 30, className }: { text: string; size?: number; className?: string }) {
  const letters = text.replace(/[^A-Za-z0-9&]/g, "").slice(0, 2).toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center bg-surface-2 font-bold tracking-wide text-ink-2", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), borderRadius: Math.round(size * 0.28) }}
    >
      {letters}
    </span>
  )
}
