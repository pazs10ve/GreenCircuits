import { describe, expect, it } from "vitest"
import { dayAfterVerb, dayWords, daysFrom, span, weekdays } from "./dates"

describe("daysFrom", () => {
  it("counts calendar days, negative before today", () => {
    expect(daysFrom("2026-09-28", "2026-10-01")).toBe(3)
    expect(daysFrom("2026-09-28", "2026-09-25")).toBe(-3)
    expect(daysFrom("2026-02-27", "2026-03-02")).toBe(3)
  })
})

describe("dayWords", () => {
  it("says the near days by name", () => {
    expect(dayWords("2026-09-28", "2026-09-28")).toBe("today")
    expect(dayWords("2026-09-29", "2026-09-28")).toBe("tomorrow")
    expect(dayWords("2026-09-27", "2026-09-28")).toBe("yesterday")
  })

  it("gives a weekday within the week and a date beyond it", () => {
    expect(dayWords("2026-10-01", "2026-09-28")).toBe("on Thursday")
    expect(dayWords("2026-10-06", "2026-09-28")).toMatch(/^on 6 Oct/)
  })

  it("drops the on after a verb", () => {
    expect(dayAfterVerb("2026-10-01", "2026-09-28")).toBe("Thursday")
    expect(dayAfterVerb("2026-09-29", "2026-09-28")).toBe("tomorrow")
  })
})

describe("span", () => {
  it("names the month once within a month", () => {
    expect(span("2026-09-24", "2026-09-28")).toMatch(/^24–28 Sep/)
  })

  it("names both months across a month's end", () => {
    expect(span("2026-09-30", "2026-10-02")).toMatch(/^30 Sep\S*–2 Oct/)
  })
})

describe("weekdays", () => {
  it("counts from today and skips weekends", () => {
    const days = weekdays("2026-09-28", 10)
    expect(days[0]).toBe("2026-09-28")
    expect(days).toHaveLength(10)
    expect(days).not.toContain("2026-10-03")
    expect(days).not.toContain("2026-10-04")
    expect(days.at(-1)).toBe("2026-10-09")
  })

  it("starts on the Monday when today is a weekend", () => {
    expect(weekdays("2026-10-03", 2)).toEqual(["2026-10-05", "2026-10-06"])
  })
})
