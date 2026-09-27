/**
 * Indian transaction costs for backtests and paper fills. The engine reads
 * dated rates from ref.charge_rate for each trade date; these are the rates in
 * force for NSE in 2026 and are editable in the strategy builder.
 */

export type CostProductId = "delivery" | "intraday" | "futures" | "options"

export interface CostModel {
  /** ₹ per executed order. */
  brokerageFlat: number
  /** % of turnover. When both are set, the lower of the two applies ("₹20 or 0.03%"). */
  brokeragePct: number
  sttBuyPct: number
  sttSellPct: number
  /** Exchange transaction charges, % of turnover. */
  exchangePct: number
  /** SEBI turnover fee, ₹ per crore. */
  sebiPerCrore: number
  stampBuyPct: number
  /** GST on brokerage, exchange and SEBI charges. */
  gstPct: number
  slippageBps: number
}

export interface CostPreset {
  id: CostProductId
  label: string
  /** What the percentages apply to. */
  basis: "turnover" | "premium"
  model: CostModel
}

export const COST_PRESETS: Record<CostProductId, CostPreset> = {
  delivery: {
    id: "delivery",
    label: "Zerodha-like delivery",
    basis: "turnover",
    model: { brokerageFlat: 0, brokeragePct: 0, sttBuyPct: 0.1, sttSellPct: 0.1, exchangePct: 0.00297, sebiPerCrore: 10, stampBuyPct: 0.015, gstPct: 18, slippageBps: 5 },
  },
  intraday: {
    id: "intraday",
    label: "Intraday (MIS)",
    basis: "turnover",
    model: { brokerageFlat: 20, brokeragePct: 0.03, sttBuyPct: 0, sttSellPct: 0.025, exchangePct: 0.00297, sebiPerCrore: 10, stampBuyPct: 0.003, gstPct: 18, slippageBps: 3 },
  },
  futures: {
    id: "futures",
    label: "F&O · futures",
    basis: "turnover",
    model: { brokerageFlat: 20, brokeragePct: 0.03, sttBuyPct: 0, sttSellPct: 0.02, exchangePct: 0.00173, sebiPerCrore: 10, stampBuyPct: 0.002, gstPct: 18, slippageBps: 2 },
  },
  options: {
    id: "options",
    label: "F&O · options",
    basis: "premium",
    model: { brokerageFlat: 20, brokeragePct: 0, sttBuyPct: 0, sttSellPct: 0.1, exchangePct: 0.03503, sebiPerCrore: 10, stampBuyPct: 0.003, gstPct: 18, slippageBps: 10 },
  },
}

export interface Charges {
  turnover: number
  brokerage: number
  stt: number
  exchange: number
  sebi: number
  stamp: number
  gst: number
  total: number
}

const round2 = (v: number) => Math.round(v * 100) / 100

/** Charges for one executed order. `turnover` is price × quantity (premium × quantity for options). */
export function orderCharges(model: CostModel, side: "BUY" | "SELL", turnover: number): Charges {
  const pctBrokerage = (turnover * model.brokeragePct) / 100
  const brokerage = model.brokeragePct > 0 ? Math.min(model.brokerageFlat, pctBrokerage) : model.brokerageFlat
  const stt = (turnover * (side === "BUY" ? model.sttBuyPct : model.sttSellPct)) / 100
  const exchange = (turnover * model.exchangePct) / 100
  const sebi = (turnover * model.sebiPerCrore) / 1e7
  const stamp = side === "BUY" ? (turnover * model.stampBuyPct) / 100 : 0
  const gst = ((brokerage + exchange + sebi) * model.gstPct) / 100
  const parts = { brokerage: round2(brokerage), stt: round2(stt), exchange: round2(exchange), sebi: round2(sebi), stamp: round2(stamp), gst: round2(gst) }
  return { turnover, ...parts, total: round2(Object.values(parts).reduce((a, b) => a + b, 0)) }
}

/** A buy and a sell of the same turnover, plus slippage on both fills. */
export function roundTrip(model: CostModel, turnover: number): { charges: number; slippage: number; total: number; pct: number } {
  const charges = orderCharges(model, "BUY", turnover).total + orderCharges(model, "SELL", turnover).total
  const slippage = (turnover * 2 * model.slippageBps) / 10_000
  const total = charges + slippage
  return { charges, slippage, total, pct: turnover > 0 ? (total / turnover) * 100 : 0 }
}

export function sameModel(a: CostModel, b: CostModel): boolean {
  return (Object.keys(a) as (keyof CostModel)[]).every((k) => a[k] === b[k])
}

/** Human summary used in the DSL and the assumptions panel. */
export function describeCosts(preset: CostPreset, model: CostModel): string {
  const on = preset.basis === "premium" ? " of premium" : ""
  const brokerage =
    model.brokerageFlat === 0 && model.brokeragePct === 0
      ? "brokerage ₹0"
      : model.brokeragePct > 0
        ? `brokerage ₹${model.brokerageFlat} or ${model.brokeragePct}%`
        : `brokerage ₹${model.brokerageFlat}/order`
  const stt =
    model.sttBuyPct > 0 && model.sttBuyPct === model.sttSellPct
      ? `stt ${model.sttBuyPct}% buy+sell`
      : `stt ${model.sttSellPct}% sell${on}`
  return [
    brokerage,
    stt,
    `exch ${model.exchangePct}%${on}`,
    `sebi ₹${model.sebiPerCrore}/cr`,
    `stamp ${model.stampBuyPct}% buy`,
    `gst ${model.gstPct}%`,
    `slippage ${model.slippageBps} bps`,
  ].join(" · ")
}
