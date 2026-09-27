import { describe, expect, it } from "vitest"
import { istDate, isTrading, sessionWhen } from "./session"

const FRIDAY_CLOSE = Date.parse("2026-09-25T09:59:00Z") // 15:29 IST, Friday 25 September
const MONDAY_NIGHT = Date.parse("2026-09-27T19:00:00Z") // 00:30 IST, Monday 28 September
const MONDAY_NOON = Date.parse("2026-09-28T06:30:00Z") // 12:00 IST

describe("sessions", () => {
  it("dates moments in IST", () => {
    expect(istDate(MONDAY_NIGHT)).toBe("2026-09-28")
    expect(istDate(FRIDAY_CLOSE)).toBe("2026-09-25")
  })

  it("counts the simulator as always trading", () => {
    expect(isTrading("SIMULATED", undefined, MONDAY_NIGHT)).toBe(true)
  })

  it("counts real prices as trading only while they're stamped today", () => {
    expect(isTrading("DELAYED", MONDAY_NOON - 60_000, MONDAY_NOON)).toBe(true)
    // An exchange holiday: the feed says delayed, but the prices are the last session's.
    expect(isTrading("DELAYED", FRIDAY_CLOSE, MONDAY_NOON)).toBe(false)
    expect(isTrading("EOD", MONDAY_NOON, MONDAY_NOON)).toBe(false)
    expect(isTrading("DELAYED", undefined, MONDAY_NOON)).toBe(false)
  })

  it("says when a finished session was", () => {
    expect(sessionWhen("2026-09-28", "2026-09-28")).toBe("today")
    expect(sessionWhen("2026-09-25", "2026-09-26")).toBe("yesterday")
    expect(sessionWhen("2026-09-25", "2026-09-28")).toBe("on Friday")
    expect(sessionWhen("2026-09-11", "2026-09-28")).toBe("on 11 September")
  })
})
