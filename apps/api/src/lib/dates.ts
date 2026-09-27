/** IST calendar helpers. Trading dates are IST; timestamps are stored in UTC. */

const IST_MS = 5.5 * 3600 * 1000

/** Today's IST date, 'YYYY-MM-DD'. */
export function istToday(now = new Date()): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' → Unix seconds of that calendar day at 00:00 UTC, the time axis the charts use for daily bars. */
export function dateToUnix(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 1000
}

/** The weekday name of an IST date, e.g. "Thursday". */
export function weekdayOf(date: string): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))
}

/** 'FY26' / 'Q1 FY27' labels from a fiscal year and period, as the UI prints them. */
export function periodLabel(fiscalYear: number, fiscalPeriod: number | null): string {
  const fy = `FY${String(fiscalYear).slice(2)}`
  return fiscalPeriod == null ? fy : `Q${fiscalPeriod} ${fy}`
}

/** The fiscal quarter label for a quarter-end date: 2026-06-30 → 'Q1 FY27'. */
export function quarterLabelOf(periodEnd: string): string {
  const [y, m] = periodEnd.split("-").map(Number) as [number, number]
  const q = m === 6 ? 1 : m === 9 ? 2 : m === 12 ? 3 : 4
  const fy = m >= 4 ? y + 1 : y
  return periodLabel(fy, q)
}
