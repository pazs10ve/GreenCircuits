/**
 * Calendar helpers for the strategy lab. Dates travel as "YYYY-MM-DD" keys in
 * IST, the way the engine stores them; lab.ts keeps trading days as UTC
 * midnights, which format to the same IST date.
 */

const IST_OFFSET_MS = 5.5 * 3600 * 1000
export const DAY_MS = 86_400_000

/** The IST calendar date of an instant, as "YYYY-MM-DD". */
export function istDateKey(date: Date | number): string {
  const ms = typeof date === "number" ? date : date.getTime()
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** UTC midnight for a date key (NaN date when the key is malformed). */
export function keyToDate(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return new Date(Number.NaN)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

export function isDateKey(key: string): boolean {
  const d = keyToDate(key)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key
}

export function addDays(key: string, days: number): string {
  return new Date(keyToDate(key).getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** Monday–Friday count between two keys, inclusive. */
export function weekdaysBetween(from: string, to: string): number {
  const a = keyToDate(from).getTime()
  const b = keyToDate(to).getTime()
  if (!(b >= a)) return 0
  const days = Math.round((b - a) / DAY_MS) + 1
  const startDow = keyToDate(from).getUTCDay()
  let count = Math.floor(days / 7) * 5
  for (let i = 0; i < days % 7; i++) {
    const dow = (startDow + i) % 7
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

/** Approximate NSE sessions: weekdays less about 14 trading holidays a year. */
export function sessionsBetween(from: string, to: string): number {
  return Math.round(weekdaysBetween(from, to) * 0.946)
}

export function yearsBetween(from: string, to: string): number {
  return (keyToDate(to).getTime() - keyToDate(from).getTime()) / (365.25 * DAY_MS)
}

const monthYear = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" })

/** "Jan 2016 – Sep 2026" */
export function formatPeriod(from: Date | number, to: Date | number): string {
  return `${monthYear.format(from)} – ${monthYear.format(to)}`
}

const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" })

/** "Mon", "Tue"… for an instant, in IST. */
export function weekdayIST(date: Date | number): string {
  return weekday.format(date)
}

/** Previous weekday key on or before the given key (weekend → Friday). */
export function lastWeekday(key: string): string {
  let k = key
  for (let i = 0; i < 3; i++) {
    const dow = keyToDate(k).getUTCDay()
    if (dow !== 0 && dow !== 6) return k
    k = addDays(k, -1)
  }
  return k
}
