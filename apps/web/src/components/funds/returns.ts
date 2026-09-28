import type { SchemeRow } from "@/lib/data/funds"

/** The spans a fund's return is quoted over: the year's change, then a year's, compounded, over three, five and ten. */
export const PERIODS = [
  { key: "y1", label: "1 year", per: "Over the past year" },
  { key: "y3", label: "3 years", per: "A year, over 3 years" },
  { key: "y5", label: "5 years", per: "A year, over 5 years" },
  { key: "y10", label: "10 years", per: "A year, over 10 years" },
] as const

export type Period = (typeof PERIODS)[number]
export type PeriodKey = Period["key"]

/** The funds' returns over a span, leaving out the ones too new to have one. */
export const returnsOf = (schemes: SchemeRow[], key: PeriodKey) => schemes.flatMap((s) => (s[key] == null ? [] : [s[key]]))

/** The middle of a set of returns: the typical fund's. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** 1st, 2nd, 3rd, 11th, 22nd. */
export function ordinal(n: number) {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}
