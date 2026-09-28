const DAY = 86_400_000

/** An IST date, YYYY-MM-DD, as a time at its midnight UTC: dates compare as days, whatever the zone. */
export const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`)

/** Whole days from `today` to `date`; negative before it. */
export const daysFrom = (today: string, date: string) => Math.round((toMs(date) - toMs(today)) / DAY)

/** "today", "tomorrow", "on Wednesday" within a week, else "on 6 October". */
export function dayWords(date: string, today: string): string {
  const days = daysFrom(today, date)
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  if (days === -1) return "yesterday"
  const format = days > 1 && days < 7 ? { weekday: "long" as const } : { day: "numeric" as const, month: "long" as const }
  return `on ${new Intl.DateTimeFormat("en-IN", { ...format, timeZone: "UTC" }).format(toMs(date))}`
}

/** "tomorrow", "Wednesday", "6 October": the same without its "on", after a verb. */
export const dayAfterVerb = (date: string, today: string) => dayWords(date, today).replace(/^on /, "")

export const longDate = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", timeZone: "UTC" }).format(toMs(date))
export const shortDate = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(toMs(date))

/** "24–26 Sept", or "30 Sept–2 Oct" across a month's end. */
export function span(from: string, to: string) {
  return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))}–${shortDate(to)}` : `${shortDate(from)}–${shortDate(to)}`
}

/** The next `n` weekdays from today, today included: the days an issue can open, close, allot or list. */
export function weekdays(today: string, n = 10): string[] {
  const out: string[] = []
  for (let t = toMs(today); out.length < n; t += DAY) {
    const d = new Date(t)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}
