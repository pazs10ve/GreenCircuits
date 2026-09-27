import { describe, expect, it } from "vitest"
import { EQUITIES, INDEX } from "../catalog"
import type { Candle, Quote } from "../types"
import { biggestSince, marketStory, movesBefore } from "./market-story"

const TS = Date.parse("2026-09-25T09:59:00Z")

function quote(id: number, changePct: number, prevClose: number): Quote {
  const ltp = prevClose * (1 + changePct / 100)
  return { id, ltp, open: prevClose, high: Math.max(ltp, prevClose), low: Math.min(ltp, prevClose), prevClose, change: ltp - prevClose, changePct, volume: 1, bid: ltp, ask: ltp, ts: TS, tickDir: 0 }
}

// Every stock up 1%, the Nifty up 0.8%.
const quotes = new Map<number, Quote>([
  [INDEX.NIFTY, quote(INDEX.NIFTY, 0.8, 23_000)],
  ...EQUITIES.map((e): [number, Quote] => [e.id, quote(e.id, 1, e.prevClose)]),
])
const read = (id: number) => quotes.get(id)

describe("the market story", () => {
  it("is in the present tense while the market trades", () => {
    const story = marketStory(read)!
    expect(story.headline).toMatch(/^Nifty rises 0\.8%, led by /)
    expect(story.standfirst).toContain(`${EQUITIES.length} of the ${EQUITIES.length} stocks are higher.`)
  })

  it("is in the past tense, saying when, once the session is over", () => {
    const story = marketStory(read, { closed: "on Friday" })!
    expect(story.headline).toMatch(/^Nifty rose 0\.8% on Friday, led by /)
    expect(story.standfirst).toContain("stocks closed higher.")
    expect(story.standfirst).not.toMatch(/\b(are|is|have|has)\b/)
  })

  it("weighs only the members it's given", () => {
    const members = EQUITIES.slice(0, 3).map((e) => e.id)
    const story = marketStory(read, { members })!
    expect(story.contributions.map((c) => c.inst.id).sort()).toEqual([...members].sort())
  })
})

describe("how rare a move is, from real bars", () => {
  const day = (d: number) => Date.UTC(2026, 0, 1) / 1000 + d * 86_400
  // 250 days rising 0.5% a day, except one 3% day a hundred days before the last.
  const candles: Candle[] = []
  let close = 100
  for (let d = 0; d < 250; d++) {
    close *= d === 150 ? 1.03 : 1.005
    candles.push({ time: day(d), open: close, high: close, low: close, close, volume: 1 })
  }
  const inst = EQUITIES[0]!

  it("leaves out the session being described", () => {
    const last = new Date(candles.at(-1)!.time * 1000).toISOString().slice(0, 10)
    expect(movesBefore(candles, last)).toHaveLength(candles.length - 2)
  })

  it("finds the last bigger move", () => {
    const moves = movesBefore(candles, "2027-12-31")
    expect(biggestSince(inst, 2, moves)).toMatch(/^Its biggest one-day rise since \d+ \w+$/)
    expect(biggestSince(inst, 4, moves)).toBe("Its biggest one-day rise in more than a year")
  })

  it("claims nothing about a year it doesn't have", () => {
    expect(biggestSince(inst, 4, movesBefore(candles.slice(-50), "2027-12-31"))).toBeNull()
  })
})
