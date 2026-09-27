import { pyRound } from "./numeric"

/**
 * Indian charges on an equity delivery order, as in pipelines/.../lab/charges.py:
 * no brokerage (a discount broker), STT of 0.1% on both sides, NSE transaction
 * charges, the SEBI fee, stamp duty on buys, 18% GST on the fees, and a flat
 * depository charge on each sale.
 */
export const DELIVERY = {
  brokeragePct: 0,
  sttPct: 0.1,
  exchangePct: 0.00297,
  sebiPerCrore: 10,
  stampBuyPct: 0.015,
  gstPct: 18,
  dpPerSell: 15.93,
} as const

export function deliveryCharges(turnover: number, side: "B" | "S", rates = DELIVERY): number {
  if (turnover <= 0) return 0
  const brokerage = (turnover * rates.brokeragePct) / 100
  const stt = (turnover * rates.sttPct) / 100
  const exchange = (turnover * rates.exchangePct) / 100
  const sebi = (turnover * rates.sebiPerCrore) / 1e7
  const stamp = side === "B" ? (turnover * rates.stampBuyPct) / 100 : 0
  const gst = ((brokerage + exchange + sebi) * rates.gstPct) / 100
  const dp = side === "S" ? rates.dpPerSell : 0
  return pyRound(brokerage + stt + exchange + sebi + stamp + gst + dp, 2)
}
