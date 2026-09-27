export interface PresetScreen {
  id: string
  name: string
  description: string
  query: string
}

/** Starting points. Each is an ordinary query the user can edit, save or backtest. */
export const PRESETS: PresetScreen[] = [
  {
    id: "quality-fair-price",
    name: "Quality at a fair price",
    description: "High returns on capital and steady profit growth, P/E under 30",
    query: "roe > 15 AND roce > 18 AND pe < 30 AND profit_cagr_3y > 8",
  },
  {
    id: "oversold-large-caps",
    name: "Oversold large caps",
    description: "RSI below 35 while still above the 200 DMA",
    query: "rsi < 35 AND price > sma_200 AND market_cap > 100000",
  },
  {
    id: "near-52w-high",
    name: "Near 52-week high",
    description: "Within 5% of the 52-week high, up over the year",
    query: "from_high_52w > -5 AND return_1y > 0",
  },
  {
    id: "dividend-yielders",
    name: "Dividend yielders",
    description: "Yield above 1.5% from profitable, modestly geared companies",
    query: "div_yield > 1.5 AND roe > 12 AND (debt_equity < 1 OR sector = \"Financials\")",
  },
  {
    id: "low-debt-compounders",
    name: "Low-debt compounders",
    description: "Almost no debt, double-digit sales and profit growth",
    query: "debt_equity < 0.2 AND sales_cagr_3y > 10 AND profit_cagr_3y > 10 AND roce > 15",
  },
  {
    id: "promoter-heavy",
    name: "Promoter-heavy, no pledge",
    description: "Promoters own over 55% and have pledged none of it",
    query: "promoter > 55 AND pledged = 0",
  },
]

export const DEFAULT_PRESET = PRESETS[0]!
