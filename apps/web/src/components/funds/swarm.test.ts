import { describe, expect, it } from "vitest"
import { swarm } from "./swarm"

describe("swarm", () => {
  it("keeps dots with room between them on the middle line", () => {
    expect(swarm([0.1, 0.3, 0.5, 0.9], 0.05)).toEqual([0, 0, 0, 0])
  })

  it("moves a crowd off the middle line, above first and then below", () => {
    expect(swarm([0.5, 0.501, 0.502, 0.503], 0.05)).toEqual([0, -1, 1, -2])
  })

  it("never puts two dots in one lane closer than the gap while a lane is free", () => {
    const xs = Array.from({ length: 40 }, (_, i) => 0.2 + i * 0.004)
    const lanes = swarm(xs, 0.01)
    const last = new Map<number, number>()
    xs.forEach((x, i) => {
      const before = last.get(lanes[i]!)
      if (before != null) expect(x - before).toBeGreaterThanOrEqual(0.01)
      last.set(lanes[i]!, x)
    })
  })

  it("puts a dot in the lane free longest once every lane is taken", () => {
    expect(swarm([0.5, 0.5, 0.5, 0.5], 0.1, [0, -1, 1])).toEqual([0, -1, 1, 0])
  })
})
