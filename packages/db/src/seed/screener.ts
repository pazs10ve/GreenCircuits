import { EQUITIES, getInstrument } from "@greencircuits/market/catalog"
import { getFundamentals, screenerSnapshot } from "@greencircuits/market/fundamentals"
import type { Db } from "../index"
import { ISSUER_ID_OFFSET } from "./reference"
import { insertMany } from "./util"

/**
 * The screener: a catalog of metrics the query language may use, and one
 * typed row per stock. The screener compiler only ever emits columns listed in
 * scr.metric, with bound parameters.
 */

const METRICS: { code: string; label: string; category: string; unit: string; column: string; refresh: string; description: string }[] = [
  { code: "price", label: "Price", category: "PRICE", unit: "INR", column: "price", refresh: "INTRADAY", description: "Last traded price" },
  { code: "change_pct", label: "Change today", category: "PRICE", unit: "PCT", column: "change_pct", refresh: "INTRADAY", description: "Change from yesterday's close" },
  { code: "return_1m", label: "1-month return", category: "PRICE", unit: "PCT", column: "return_1m_pct", refresh: "EOD", description: "Price return over 21 sessions" },
  { code: "return_1y", label: "1-year return", category: "PRICE", unit: "PCT", column: "return_1y_pct", refresh: "EOD", description: "Price return over 250 sessions" },
  { code: "high_52w", label: "52-week high", category: "PRICE", unit: "INR", column: "high_52w", refresh: "EOD", description: "Highest price in 52 weeks" },
  { code: "low_52w", label: "52-week low", category: "PRICE", unit: "INR", column: "low_52w", refresh: "EOD", description: "Lowest price in 52 weeks" },
  { code: "from_high", label: "From 52-week high", category: "PRICE", unit: "PCT", column: "from_52w_high_pct", refresh: "EOD", description: "Distance below the 52-week high" },
  { code: "mcap", label: "Market cap", category: "VALUATION", unit: "INR_CR", column: "mcap_cr", refresh: "INTRADAY", description: "Market capitalisation, ₹ crore" },
  { code: "pe", label: "P/E", category: "VALUATION", unit: "X", column: "pe_ttm", refresh: "EOD", description: "Price to trailing earnings" },
  { code: "pb", label: "P/B", category: "VALUATION", unit: "X", column: "pb", refresh: "EOD", description: "Price to book value" },
  { code: "div_yield", label: "Dividend yield", category: "VALUATION", unit: "PCT", column: "div_yield_pct", refresh: "EOD", description: "Dividends over the last year, as % of price" },
  { code: "roe", label: "Return on equity", category: "PROFITABILITY", unit: "PCT", column: "roe_pct", refresh: "QUARTERLY", description: "Net profit / shareholders' equity" },
  { code: "roce", label: "Return on capital employed", category: "PROFITABILITY", unit: "PCT", column: "roce_pct", refresh: "QUARTERLY", description: "EBIT / capital employed" },
  { code: "opm", label: "Operating margin", category: "PROFITABILITY", unit: "PCT", column: "opm_pct", refresh: "QUARTERLY", description: "Operating profit / revenue" },
  { code: "sales_cagr_3y", label: "Sales growth, 3 years", category: "GROWTH", unit: "PCT", column: "sales_cagr_3y_pct", refresh: "QUARTERLY", description: "Annual revenue growth over three years" },
  { code: "profit_cagr_3y", label: "Profit growth, 3 years", category: "GROWTH", unit: "PCT", column: "profit_cagr_3y_pct", refresh: "QUARTERLY", description: "Annual profit growth over three years" },
  { code: "debt_equity", label: "Debt to equity", category: "BALANCE_SHEET", unit: "RATIO", column: "debt_to_equity", refresh: "QUARTERLY", description: "Borrowings / shareholders' equity; not meaningful for lenders" },
  { code: "promoter", label: "Promoter holding", category: "OWNERSHIP", unit: "PCT", column: "promoter_pct", refresh: "QUARTERLY", description: "Shares held by the promoter group" },
  { code: "pledged", label: "Promoter shares pledged", category: "OWNERSHIP", unit: "PCT", column: "promoter_pledge_pct", refresh: "QUARTERLY", description: "Share of promoter holding that is pledged" },
  { code: "rsi", label: "RSI (14)", category: "TECHNICAL", unit: "RATIO", column: "rsi_14", refresh: "EOD", description: "14-day relative strength index" },
  { code: "sma_50", label: "50-day average", category: "TECHNICAL", unit: "INR", column: "sma_50", refresh: "EOD", description: "Simple moving average of 50 closes" },
  { code: "sma_200", label: "200-day average", category: "TECHNICAL", unit: "INR", column: "sma_200", refresh: "EOD", description: "Simple moving average of 200 closes" },
]

export async function seedScreener(db: Db): Promise<Record<string, number>> {
  await db
    .insertInto("scr.metric")
    .values(METRICS.map((m) => ({ code: m.code, label: m.label, category: m.category, unit: m.unit, column_name: m.column, refresh: m.refresh, description: m.description })))
    .onConflict((oc) =>
      oc.column("code").doUpdateSet((eb) => ({ label: eb.ref("excluded.label"), column_name: eb.ref("excluded.column_name"), description: eb.ref("excluded.description") })),
    )
    .execute()

  const industries = await db.selectFrom("ref.industry").select(["id", "name", "level"]).where("level", "=", 2).execute()
  await db.deleteFrom("scr.equity_snapshot").where("instrument_id", "in", EQUITIES.map((e) => e.id)).execute()
  const now = new Date()
  const rows = screenerSnapshot().map((r) => {
    const inst = getInstrument(r.id)!
    const f = getFundamentals(inst)
    return {
      instrument_id: r.id,
      security_id: ISSUER_ID_OFFSET + r.id,
      issuer_id: ISSUER_ID_OFFSET + r.id,
      industry_id: industries.find((i) => i.name === inst.industry)?.id ?? null,
      mcap_bucket: "LARGE",
      index_ids: inst.indices ?? [],
      is_fo: inst.isFo ?? false,
      price: inst.prevClose,
      change_pct: 0,
      return_1m_pct: r.return1m,
      return_1y_pct: r.return1y,
      high_52w: r.high52,
      low_52w: r.low52,
      from_52w_high_pct: r.fromHigh52,
      avg_volume_20d: inst.avgVolume,
      mcap_cr: r.mcapCr,
      pe_ttm: r.pe,
      pb: r.pb,
      div_yield_pct: r.divYield,
      roe_pct: r.roe,
      roce_pct: r.roce,
      opm_pct: r.opm,
      npm_pct: f.npm,
      sales_cagr_3y_pct: r.salesCagr3y,
      profit_cagr_3y_pct: r.profitCagr3y,
      eps_ttm: f.epsTtm,
      debt_to_equity: r.debtEquity,
      promoter_pct: r.promoter,
      promoter_pledge_pct: r.pledged,
      fpi_pct: f.shareholding.at(-1)!.fpi,
      dii_pct: f.shareholding.at(-1)!.dii,
      rsi_14: r.rsi14,
      sma_50: r.sma50,
      sma_200: r.sma200,
      volatility_1y_pct: inst.vol * 100,
      beta_1y: inst.beta,
      price_updated_at: now,
      eod_updated_at: now,
    }
  })
  await insertMany(db, "scr.equity_snapshot", rows)
  return { metrics: METRICS.length, rows: rows.length }
}

export async function seedPlans(db: Db): Promise<number> {
  const plans = [
    { code: "FREE", name: "Free", price_inr: 0, billing_period: "NONE", limits: { watchlists: 3, alerts: 5, backtests_per_day: 20, realtime: false } },
    { code: "PRO", name: "Pro", price_inr: 338, billing_period: "MONTH", limits: { watchlists: null, alerts: 100, backtests_per_day: 500, realtime: true } },
    { code: "PRO_ANNUAL", name: "Pro (yearly)", price_inr: 3389, billing_period: "YEAR", limits: { watchlists: null, alerts: 100, backtests_per_day: 500, realtime: true } },
  ]
  await db
    .insertInto("app.plan")
    .values(plans.map((p) => ({ ...p, limits: JSON.stringify(p.limits) })))
    .onConflict((oc) => oc.column("code").doUpdateSet((eb) => ({ name: eb.ref("excluded.name"), limits: eb.ref("excluded.limits") })))
    .execute()
  return plans.length
}
