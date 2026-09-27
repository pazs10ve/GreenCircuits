import { TickMarkType, type Time } from "lightweight-charts"

const formats: Record<number, Intl.DateTimeFormatOptions> = {
  [TickMarkType.Year]: { year: "numeric" },
  [TickMarkType.Month]: { month: "short" },
  [TickMarkType.DayOfMonth]: { day: "numeric", month: "short" },
  [TickMarkType.Time]: { hour: "2-digit", minute: "2-digit", hour12: false },
  [TickMarkType.TimeWithSeconds]: { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false },
}

/** Axis labels in IST: charts get UTC timestamps, Indian markets read IST. */
export function istTickFormatter(time: Time, type: TickMarkType): string {
  const seconds = typeof time === "number" ? time : Date.UTC(
    typeof time === "string" ? Number(time.slice(0, 4)) : time.year,
    typeof time === "string" ? Number(time.slice(5, 7)) - 1 : time.month - 1,
    typeof time === "string" ? Number(time.slice(8, 10)) : time.day,
  ) / 1000
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...formats[type] }).format(seconds * 1000)
}
