import { describe, expect, it } from "vitest"
import { addDays, istToday, quarterLabelOf } from "./dates"

describe("IST dates", () => {
  it("rolls over at midnight in India", () => {
    expect(istToday(new Date("2026-09-27T18:29:00Z"))).toBe("2026-09-27")
    expect(istToday(new Date("2026-09-27T18:31:00Z"))).toBe("2026-09-28")
  })

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02")
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29")
  })

  it("labels quarters by the Indian fiscal year", () => {
    expect(quarterLabelOf("2026-06-30")).toBe("Q1 FY27")
    expect(quarterLabelOf("2026-12-31")).toBe("Q3 FY27")
    expect(quarterLabelOf("2027-03-31")).toBe("Q4 FY27")
  })
})
