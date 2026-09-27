/**
 * Indian-market number formatting: en-IN digit grouping (1,23,45,678),
 * lakh and crore units, signed changes with a true minus sign, IST times.
 */

const MINUS = "−"

const groupers = new Map<number, Intl.NumberFormat>()
function grouper(decimals: number): Intl.NumberFormat {
  let f = groupers.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    groupers.set(decimals, f)
  }
  return f
}

function withMinus(text: string): string {
  return text.startsWith("-") ? MINUS + text.slice(1) : text
}

/** 1234567.891 → "12,34,567.89" */
export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "–"
  return withMinus(grouper(decimals).format(value))
}

/** Decimals implied by a tick size: 0.05 → 2, 0.0025 → 4, 1 → 0. */
export function decimalsForTick(tick = 0.05): number {
  if (tick >= 1) return 0
  const text = tick.toString()
  const idx = text.indexOf(".")
  return Math.max(2, idx === -1 ? 0 : text.length - idx - 1)
}

export function formatPrice(value: number | null | undefined, tick = 0.05): string {
  return formatNumber(value, decimalsForTick(tick))
}

export function formatINR(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "–"
  const text = formatNumber(Math.abs(value), decimals)
  return `${value < 0 ? MINUS : ""}₹${text}`
}

/** Compact Indian units: 1.2 K, 45.6 L, 12.3 Cr, 1.9 L Cr. */
export function formatCompact(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return "–"
  const sign = value < 0 ? MINUS : ""
  const v = Math.abs(value)
  if (v >= 1e12) return `${sign}${formatNumber(v / 1e12, decimals)} L Cr`
  if (v >= 1e7) return `${sign}${formatNumber(v / 1e7, decimals)} Cr`
  if (v >= 1e5) return `${sign}${formatNumber(v / 1e5, decimals)} L`
  if (v >= 1e3) return `${sign}${formatNumber(v / 1e3, decimals)} K`
  return `${sign}${formatNumber(v, v % 1 === 0 ? 0 : decimals)}`
}

/** Amounts already expressed in crore (market cap, turnover): 191234 → "₹1.9 L Cr", 4520 → "₹4,520 Cr". */
export function formatCrore(crore: number | null | undefined): string {
  if (crore == null || Number.isNaN(crore)) return "–"
  if (Math.abs(crore) >= 1e5) return `₹${formatNumber(crore / 1e5, 1)} L Cr`
  return `₹${formatNumber(crore, 0)} Cr`
}

export function formatSigned(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "–"
  const text = grouper(decimals).format(Math.abs(value))
  // Values that round to zero get no sign: "0.00", not "+0.00".
  if (Math.abs(value) < 0.5 * 10 ** -decimals) return text
  if (value > 0) return `+${text}`
  return `${MINUS}${text}`
}

export function formatPct(value: number | null | undefined, decimals = 2, signed = true): string {
  if (value == null || Number.isNaN(value)) return "–"
  return `${signed ? formatSigned(value, decimals) : formatNumber(value, decimals)}%`
}

export function formatTimeIST(date: Date | number, withSeconds = false): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  }).format(date)
}

export function formatDateIST(date: Date | number, style: "short" | "medium" | "long" = "medium"): string {
  const opts: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "numeric", month: "short" }
      : style === "long"
        ? { weekday: "short", day: "numeric", month: "short", year: "numeric" }
        : { day: "numeric", month: "short", year: "numeric" }
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...opts }).format(date)
}

export function direction(value: number | null | undefined): "up" | "down" | "flat" {
  if (value == null || value === 0 || Number.isNaN(value)) return "flat"
  return value > 0 ? "up" : "down"
}
