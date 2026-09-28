import { cn } from "@/lib/utils"

/**
 * The GreenCircuits mark: a circuit trace that steps up like a price hitting
 * its upper circuit, ending in a green solder pad.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-6", className)}>
      <rect x="1.5" y="1.5" width="29" height="29" rx="7" className="fill-none stroke-ink" strokeWidth="1.5" />
      <path d="M6.5 22 H12 L16 14 H20 L22.6 9.8" fill="none" className="stroke-ink" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="22" r="1.9" className="fill-ink" />
      <circle cx="24" cy="8.2" r="3.1" className="fill-brand" />
    </svg>
  )
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <LogoMark />
      {!compact && <span className="font-serif text-[1.3rem] leading-none font-semibold tracking-[-0.01em]">GreenCircuits</span>}
    </span>
  )
}
