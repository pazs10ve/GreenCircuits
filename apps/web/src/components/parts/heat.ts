/**
 * A tile's colours for a move: grey for nothing, deeper green or red as it
 * grows, up to `cap` per cent. Capped, so the day's biggest moves stand out
 * without the whole map shouting. Text turns white once the fill is dark.
 */
export function heat(pct: number | null | undefined, cap = 3): { bg: string; fg: string } {
  if (pct == null || Number.isNaN(pct) || Math.abs(pct) < 0.05) return { bg: "var(--surface-2)", fg: "var(--ink)" }
  const t = Math.min(1, Math.abs(pct) / cap)
  return {
    bg: `color-mix(in oklch, ${pct > 0 ? "var(--up)" : "var(--down)"} ${Math.round(14 + t * 62)}%, var(--surface-2))`,
    fg: t > 0.62 ? "#fff" : "var(--ink)",
  }
}
