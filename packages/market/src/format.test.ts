import { describe, expect, it } from "vitest"
import { formatCompact, formatCrore, formatINR, formatNumber, formatPct, formatSigned } from "./format"

describe("Indian number formatting", () => {
  it("groups digits in lakhs and crores", () => {
    expect(formatNumber(12345678.9)).toBe("1,23,45,678.90")
    expect(formatINR(-1234.5)).toBe("−₹1,234.50")
  })

  it("abbreviates with Indian units", () => {
    expect(formatCompact(456_000)).toBe("4.6 L")
    expect(formatCompact(123_000_000)).toBe("12.3 Cr")
    expect(formatCrore(191_234)).toBe("₹1.9 L Cr")
    expect(formatCrore(4520)).toBe("₹4,520 Cr")
  })

  it("signs changes with a true minus and never signs zero", () => {
    expect(formatSigned(1.234)).toBe("+1.23")
    expect(formatSigned(-1.234)).toBe("−1.23")
    expect(formatSigned(-0.001)).toBe("0.00")
    expect(formatPct(0.5)).toBe("+0.50%")
  })

  it("shows a dash for missing values", () => {
    expect(formatNumber(null)).toBe("–")
    expect(formatPct(Number.NaN)).toBe("–")
  })
})
