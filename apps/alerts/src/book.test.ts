import { describe, expect, it } from "vitest"
import type { Quote } from "@greencircuits/market/types"
import { AlertBook, isMet, type LiveAlert } from "./book"

const quote = (id: number, ltp: number, changePct = 0): Quote => ({
  id,
  ltp,
  open: ltp,
  high: ltp,
  low: ltp,
  prevClose: ltp,
  change: 0,
  changePct,
  volume: 0,
  bid: ltp,
  ask: ltp,
  ts: 0,
  tickDir: 0,
})

const alert = (over: Partial<LiveAlert> = {}): LiveAlert => ({
  id: "a1",
  version: 1,
  userId: "u1",
  instrumentId: 100,
  kind: "PRICE_ABOVE",
  threshold: 1440,
  repeat: false,
  cooldownMs: 86_400_000,
  lastTriggeredAt: null,
  note: null,
  ...over,
})

describe("isMet", () => {
  it("compares price and day change in the right direction", () => {
    expect(isMet({ kind: "PRICE_ABOVE", threshold: 100 }, { ltp: 100, changePct: 0 })).toBe(true)
    expect(isMet({ kind: "PRICE_ABOVE", threshold: 100 }, { ltp: 99.95, changePct: 0 })).toBe(false)
    expect(isMet({ kind: "PRICE_BELOW", threshold: 100 }, { ltp: 99, changePct: 0 })).toBe(true)
    expect(isMet({ kind: "CHANGE_PCT_ABOVE", threshold: 2 }, { ltp: 1, changePct: 2.1 })).toBe(true)
    expect(isMet({ kind: "CHANGE_PCT_BELOW", threshold: -1.5 }, { ltp: 1, changePct: -1.4 })).toBe(false)
  })
})

describe("AlertBook", () => {
  it("only looks at alerts on the instrument that moved", () => {
    const book = new AlertBook()
    book.load([alert(), alert({ id: "a2", instrumentId: 101 })])
    expect(book.due(quote(100, 1450), 0).map((a) => a.id)).toEqual(["a1"])
    expect(book.due(quote(102, 9999), 0)).toEqual([])
  })

  it("never offers an alert twice while it is being fired", () => {
    const book = new AlertBook()
    const a = alert()
    book.load([a])
    book.claim(a)
    expect(book.due(quote(100, 1450), 0)).toEqual([])
  })

  it("drops one-shot alerts after they fire and respects cooldowns for repeating ones", () => {
    const book = new AlertBook()
    const once = alert()
    const repeat = alert({ id: "a2", repeat: true, cooldownMs: 1000 })
    book.load([once, repeat])
    book.settle(once, true, 0)
    book.settle(repeat, true, 0)
    expect(book.due(quote(100, 1450), 500)).toEqual([])
    expect(book.due(quote(100, 1450), 1000).map((a) => a.id)).toEqual(["a2"])
    expect(book.size).toBe(1)
  })
})
