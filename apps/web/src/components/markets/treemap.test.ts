import { describe, expect, it } from "vitest"
import { squarify } from "./treemap"

describe("squarify", () => {
  const rect = { x: 0, y: 0, w: 600, h: 400 }

  it("gives every item its share of the area and fills the rectangle", () => {
    const items = [6, 6, 4, 3, 2, 2, 1]
    const tiles = squarify(items, (v) => v, rect)
    const total = items.reduce((s, v) => s + v, 0)
    expect(tiles).toHaveLength(items.length)
    for (const t of tiles) expect(t.w * t.h).toBeCloseTo((t.item / total) * rect.w * rect.h, 6)
    expect(tiles.reduce((s, t) => s + t.w * t.h, 0)).toBeCloseTo(rect.w * rect.h, 6)
  })

  it("keeps tiles inside the rectangle, without overlaps", () => {
    const tiles = squarify([5, 4, 3, 3, 2, 1, 1, 1], (v) => v, rect)
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9)
      expect(t.y).toBeGreaterThanOrEqual(-1e-9)
      expect(t.x + t.w).toBeLessThanOrEqual(rect.w + 1e-9)
      expect(t.y + t.h).toBeLessThanOrEqual(rect.h + 1e-9)
    }
    for (const [i, a] of tiles.entries())
      for (const b of tiles.slice(i + 1)) {
        const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
        expect(overlap).toBeLessThan(1e-6)
      }
  })

  it("leaves out items worth nothing, and returns nothing for nothing", () => {
    expect(squarify([3, 0, -1], (v) => v, rect)).toHaveLength(1)
    expect(squarify([], (v: number) => v, rect)).toEqual([])
  })
})
