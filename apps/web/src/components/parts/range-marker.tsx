import { cn } from "@/lib/utils"

const clamp = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Where a value sits on a range: a price in its 52-week range, a P/E against
 * its history, the VIX between calm and nervous, a price and the alert
 * waiting for it. One part, drawn the same everywhere. Positions run 0 to 1.
 */
export function RangeMarker({
  value,
  left,
  right,
  caption,
  zones,
  mark,
  markerClassName,
  label,
  className,
}: {
  value: number
  left?: React.ReactNode
  right?: React.ReactNode
  /** Between the end labels: what the tick is, say "median 26×". */
  caption?: React.ReactNode
  /** Tinted stretches of the track, e.g. calm and nervous. */
  zones?: { from: number; to: number; className: string }[]
  /** A tick on the track: a median, a trigger. */
  mark?: number
  markerClassName?: string
  /** What the marker shows, for a screen reader. */
  label?: string
  className?: string
}) {
  return (
    <div className={className} role={label ? "img" : undefined} aria-label={label}>
      <div className="relative h-1.5 rounded-full bg-surface-2">
        {zones?.map((z, i) => (
          <span
            key={i}
            className={cn("absolute inset-y-0", i === 0 && "rounded-l-full", i === zones.length - 1 && "rounded-r-full", z.className)}
            style={{ left: `${clamp(z.from) * 100}%`, width: `${(clamp(z.to) - clamp(z.from)) * 100}%` }}
          />
        ))}
        {mark != null && <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-ink-3" style={{ left: `${clamp(mark) * 100}%` }} />}
        <span
          className={cn("absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-paper bg-ink shadow-[0_0_0_1px_var(--rule-strong)]", markerClassName)}
          style={{ left: `${clamp(value) * 100}%` }}
        />
      </div>
      {(left != null || right != null || caption != null) && (
        <div className="mt-2 flex justify-between gap-2 text-[11px] leading-none text-ink-3">
          <span>{left}</span>
          {caption != null && <span>{caption}</span>}
          <span>{right}</span>
        </div>
      )}
    </div>
  )
}
