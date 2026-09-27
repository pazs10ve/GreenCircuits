import { EQUITIES, INDEX, getInstrument } from "@greencircuits/market/catalog"
import { hashString, mulberry32, pick, roundTo } from "@greencircuits/market/random"
import { keyToDate } from "./dates"

/**
 * Sample signals for a strategy deployed to paper trading, for one IST
 * session. The paper runner will produce these from the live 1-minute bars;
 * until then they are seeded by strategy and date so they stay put on reload.
 */

export interface Signal {
  time: string
  action: string
  symbol: string
  instrumentId?: number
  price?: number
  detail: string
}

function priceNear(id: number, rng: () => number, spread = 0.012): number {
  const inst = getInstrument(id)!
  return roundTo(inst.prevClose * (1 + (rng() - 0.5) * spread), inst.tick)
}

export function signalsFor(strategyId: string, sessionKey: string): Signal[] {
  const rng = mulberry32(hashString(`${strategyId}:${sessionKey}`))
  const dow = keyToDate(sessionKey).getUTCDay()
  const dayOfMonth = keyToDate(sessionKey).getUTCDate()

  if (strategyId === "rsi-dip") {
    const a = pick(rng, EQUITIES)
    const b = pick(rng, EQUITIES.filter((e) => e.id !== a.id))
    return [
      { time: "09:31", action: "BUY", symbol: a.symbol, instrumentId: a.id, price: priceNear(a.id, rng), detail: "RSI(14) crossed below 30 while above the 200-day average · 1% risk" },
      { time: "13:05", action: "EXIT", symbol: b.symbol, instrumentId: b.id, price: priceNear(b.id, rng), detail: "RSI(14) back above 60 · signal exit" },
    ]
  }
  if (strategyId === "breakout-52w") {
    const a = pick(rng, EQUITIES)
    return [
      { time: "09:45", action: "BUY", symbol: a.symbol, instrumentId: a.id, price: priceNear(a.id, rng), detail: `New 52-week high on ${(1.3 + rng() * 0.8).toFixed(1)}× average delivery` },
      { time: "15:10", action: "HOLD", symbol: "12 positions", detail: "No trailing stops hit; no close below the 50-day average" },
    ]
  }
  if (strategyId === "straddle-0920") {
    const nifty = getInstrument(INDEX.NIFTY)!
    const atm = Math.round(nifty.prevClose / 50) * 50
    if (dow !== 2) return [{ time: "09:20", action: "WAIT", symbol: "NIFTY", detail: "Trades on the weekly expiry only (Tuesdays)" }]
    return [
      { time: "09:20", action: "SELL", symbol: `NIFTY ${atm} CE`, price: roundTo(60 + rng() * 40, 0.05), detail: "ATM call · 1 lot · 25% stop" },
      { time: "09:20", action: "SELL", symbol: `NIFTY ${atm} PE`, price: roundTo(60 + rng() * 40, 0.05), detail: "ATM put · 1 lot · 25% stop" },
    ]
  }
  if (strategyId === "sector-rotation") {
    if (dayOfMonth > 3) return [{ time: "09:15", action: "HOLD", symbol: "NIFTY IT, NIFTY AUTO, NIFTY PHARMA", detail: "Rebalances on the first session of next month" }]
    return [{ time: "09:15", action: "REBALANCE", symbol: "Top 3 sectors", detail: "Ranked by 3-month return; equal weight" }]
  }
  return []
}
