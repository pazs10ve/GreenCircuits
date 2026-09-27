import type { ScreenRow } from "@greencircuits/market/fundamentals"

/** A screener row with the live quote merged in. Price fields stay null until the feed has started. */
export interface LiveRow extends ScreenRow {
  price: number | null
  changePct: number | null
}

export type FieldGroup =
  | "Price"
  | "Valuation"
  | "Profitability"
  | "Growth"
  | "Balance sheet"
  | "Ownership"
  | "Technicals"
  | "Returns"
  | "Company"

export const FIELD_GROUPS: FieldGroup[] = [
  "Price",
  "Valuation",
  "Profitability",
  "Growth",
  "Balance sheet",
  "Ownership",
  "Technicals",
  "Returns",
  "Company",
]

/** How a value is shown in the results table. */
export type FieldFormat = "price" | "pct" | "signedPct" | "ratio" | "crore" | "index" | "text"

export interface FieldDef {
  /** Name used in queries, snake_case. */
  name: string
  /** Short column header. */
  label: string
  /** Full name for the field reference. */
  title: string
  description: string
  /** Unit shown in the reference and CSV headers. */
  unit: string
  type: "number" | "text"
  group: FieldGroup
  format: FieldFormat
  decimals: number
  /** Other spellings people type; they resolve to `name`. */
  aliases?: string[]
  /** Comes from the live feed rather than yesterday's snapshot. */
  live?: boolean
  /** A condition that uses the field, for hints. */
  example: string
  get: (row: LiveRow) => number | string | null
}

const num = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v)

export const FIELDS: FieldDef[] = [
  {
    name: "price",
    label: "Price",
    title: "Last traded price",
    description: "Live price from the simulated feed.",
    unit: "₹",
    type: "number",
    group: "Price",
    format: "price",
    decimals: 2,
    aliases: ["ltp", "cmp", "current_price", "last_price"],
    live: true,
    example: "price > sma_200",
    get: (r) => num(r.price),
  },
  {
    name: "change_pct",
    label: "Change",
    title: "Today's change",
    description: "Live change from yesterday's close.",
    unit: "%",
    type: "number",
    group: "Price",
    format: "signedPct",
    decimals: 2,
    aliases: ["change", "chg", "day_change", "pct_change", "change_percent"],
    live: true,
    example: "change_pct > 1",
    get: (r) => num(r.changePct),
  },
  {
    name: "market_cap",
    label: "Market cap",
    title: "Market capitalisation",
    description: "Shares outstanding × yesterday's close. ₹1 lakh crore is 100000.",
    unit: "₹ Cr",
    type: "number",
    group: "Valuation",
    format: "crore",
    decimals: 0,
    aliases: ["mcap", "marketcap", "m_cap", "market_capitalisation", "market_capitalization"],
    example: "market_cap > 100000",
    get: (r) => num(r.mcapCr),
  },
  {
    name: "pe",
    label: "P/E",
    title: "Price to earnings",
    description: "Yesterday's close ÷ trailing twelve-month EPS.",
    unit: "×",
    type: "number",
    group: "Valuation",
    format: "ratio",
    decimals: 1,
    aliases: ["p_e", "pe_ratio", "price_to_earnings", "price_earnings"],
    example: "pe < 25",
    get: (r) => num(r.pe),
  },
  {
    name: "pb",
    label: "P/B",
    title: "Price to book",
    description: "Yesterday's close ÷ book value per share.",
    unit: "×",
    type: "number",
    group: "Valuation",
    format: "ratio",
    decimals: 2,
    aliases: ["p_b", "pbv", "price_to_book"],
    example: "pb < 3",
    get: (r) => num(r.pb),
  },
  {
    name: "div_yield",
    label: "Div yield",
    title: "Dividend yield",
    description: "Dividends per share over the last year ÷ yesterday's close.",
    unit: "%",
    type: "number",
    group: "Valuation",
    format: "pct",
    decimals: 2,
    aliases: ["dividend_yield", "dy", "yield"],
    example: "div_yield > 2",
    get: (r) => num(r.divYield),
  },
  {
    name: "roe",
    label: "ROE",
    title: "Return on equity",
    description: "Net profit ÷ shareholders' equity, trailing twelve months.",
    unit: "%",
    type: "number",
    group: "Profitability",
    format: "pct",
    decimals: 1,
    aliases: ["return_on_equity"],
    example: "roe > 15",
    get: (r) => num(r.roe),
  },
  {
    name: "roce",
    label: "ROCE",
    title: "Return on capital employed",
    description: "Operating profit ÷ (equity + borrowings).",
    unit: "%",
    type: "number",
    group: "Profitability",
    format: "pct",
    decimals: 1,
    aliases: ["return_on_capital_employed", "return_on_capital"],
    example: "roce > 20",
    get: (r) => num(r.roce),
  },
  {
    name: "opm",
    label: "OPM",
    title: "Operating profit margin",
    description: "Operating profit ÷ revenue, trailing twelve months.",
    unit: "%",
    type: "number",
    group: "Profitability",
    format: "pct",
    decimals: 1,
    aliases: ["operating_margin", "operating_profit_margin", "ebitda_margin"],
    example: "opm > 20",
    get: (r) => num(r.opm),
  },
  {
    name: "sales_cagr_3y",
    label: "Sales CAGR 3Y",
    title: "Sales growth, 3-year CAGR",
    description: "Compound annual revenue growth over the last three financial years.",
    unit: "%",
    type: "number",
    group: "Growth",
    format: "pct",
    decimals: 1,
    aliases: ["sales_growth_3y", "revenue_cagr_3y", "sales_cagr", "revenue_growth_3y"],
    example: "sales_cagr_3y > 12",
    get: (r) => num(r.salesCagr3y),
  },
  {
    name: "profit_cagr_3y",
    label: "Profit CAGR 3Y",
    title: "Profit growth, 3-year CAGR",
    description: "Compound annual net profit growth over the last three financial years.",
    unit: "%",
    type: "number",
    group: "Growth",
    format: "pct",
    decimals: 1,
    aliases: ["profit_growth_3y", "profit_cagr", "earnings_growth_3y"],
    example: "profit_cagr_3y > 15",
    get: (r) => num(r.profitCagr3y),
  },
  {
    name: "debt_equity",
    label: "D/E",
    title: "Debt to equity",
    description: "Borrowings ÷ shareholders' equity. Not reported for banks and financials, so they never pass a D/E condition.",
    unit: "×",
    type: "number",
    group: "Balance sheet",
    format: "ratio",
    decimals: 2,
    aliases: ["de", "d_e", "debt_to_equity", "debt_equity_ratio"],
    example: "debt_equity < 0.5",
    get: (r) => num(r.debtEquity),
  },
  {
    name: "promoter",
    label: "Promoter",
    title: "Promoter holding",
    description: "Share of equity held by promoters, latest quarter. Zero for professionally run companies.",
    unit: "%",
    type: "number",
    group: "Ownership",
    format: "pct",
    decimals: 1,
    aliases: ["promoter_holding", "promoters", "promoter_pct"],
    example: "promoter > 50",
    get: (r) => num(r.promoter),
  },
  {
    name: "pledged",
    label: "Pledged",
    title: "Promoter pledge",
    description: "Promoter shares pledged, as a percentage of promoter holding.",
    unit: "%",
    type: "number",
    group: "Ownership",
    format: "pct",
    decimals: 2,
    aliases: ["pledge", "pledged_pct", "pledged_percentage", "promoter_pledge"],
    example: "pledged = 0",
    get: (r) => num(r.pledged),
  },
  {
    name: "rsi",
    label: "RSI 14",
    title: "Relative strength index, 14 days",
    description: "Momentum on daily closes. Below 30 is usually read as oversold, above 70 as overbought.",
    unit: "0–100",
    type: "number",
    group: "Technicals",
    format: "index",
    decimals: 1,
    aliases: ["rsi_14", "rsi14"],
    example: "rsi < 35",
    get: (r) => num(r.rsi14),
  },
  {
    name: "sma_50",
    label: "50 DMA",
    title: "50-day moving average",
    description: "Simple average of the last 50 daily closes.",
    unit: "₹",
    type: "number",
    group: "Technicals",
    format: "price",
    decimals: 2,
    aliases: ["sma50", "dma_50", "dma50", "ma_50", "ma50"],
    example: "price > sma_50",
    get: (r) => num(r.sma50),
  },
  {
    name: "sma_200",
    label: "200 DMA",
    title: "200-day moving average",
    description: "Simple average of the last 200 daily closes.",
    unit: "₹",
    type: "number",
    group: "Technicals",
    format: "price",
    decimals: 2,
    aliases: ["sma200", "dma_200", "dma200", "ma_200", "ma200"],
    example: "price > sma_200",
    get: (r) => num(r.sma200),
  },
  {
    name: "high_52w",
    label: "52W high",
    title: "52-week high",
    description: "Highest price over the last 250 sessions.",
    unit: "₹",
    type: "number",
    group: "Technicals",
    format: "price",
    decimals: 2,
    aliases: ["high52", "high_52", "high52w", "year_high"],
    example: "price > high_52w * 0.95",
    get: (r) => num(r.high52),
  },
  {
    name: "low_52w",
    label: "52W low",
    title: "52-week low",
    description: "Lowest price over the last 250 sessions.",
    unit: "₹",
    type: "number",
    group: "Technicals",
    format: "price",
    decimals: 2,
    aliases: ["low52", "low_52", "low52w", "year_low"],
    example: "price < low_52w * 1.1",
    get: (r) => num(r.low52),
  },
  {
    name: "from_high_52w",
    label: "From 52W high",
    title: "Distance from 52-week high",
    description: "Yesterday's close against the 52-week high. 0 means at the high; −10 means 10% below it.",
    unit: "%",
    type: "number",
    group: "Technicals",
    format: "signedPct",
    decimals: 1,
    aliases: ["from_high", "off_high", "from_52w_high", "drawdown"],
    example: "from_high_52w > -5",
    get: (r) => num(r.fromHigh52),
  },
  {
    name: "return_1m",
    label: "1M return",
    title: "1-month return",
    description: "Price change over the last 21 sessions, to yesterday's close.",
    unit: "%",
    type: "number",
    group: "Returns",
    format: "signedPct",
    decimals: 1,
    aliases: ["return1m", "ret_1m", "returns_1m"],
    example: "return_1m > 0",
    get: (r) => num(r.return1m),
  },
  {
    name: "return_1y",
    label: "1Y return",
    title: "1-year return",
    description: "Price change over the last 250 sessions, to yesterday's close.",
    unit: "%",
    type: "number",
    group: "Returns",
    format: "signedPct",
    decimals: 1,
    aliases: ["return1y", "ret_1y", "returns_1y", "return_12m"],
    example: "return_1y > 20",
    get: (r) => num(r.return1y),
  },
  {
    name: "sector",
    label: "Sector",
    title: "Sector",
    description:
      "Financials, IT, Energy, Consumer, Auto, Healthcare, Materials, Industrials, Telecom or Utilities. Compare with = or != and quote the name.",
    unit: "text",
    type: "text",
    group: "Company",
    format: "text",
    decimals: 0,
    aliases: ["industry_group"],
    example: 'sector = "IT"',
    get: (r) => r.sector,
  },
]

const byName = new Map<string, FieldDef>()
for (const f of FIELDS) {
  byName.set(f.name, f)
  for (const a of f.aliases ?? []) byName.set(a, f)
}

/** Look a field up by its name or an alias, case-insensitively. */
export function resolveField(name: string): FieldDef | undefined {
  return byName.get(name.toLowerCase())
}

export function getField(name: string): FieldDef {
  const f = byName.get(name)
  if (!f) throw new Error(`Unknown screener field ${name}`)
  return f
}

/** Columns shown before the user picks their own. */
export const DEFAULT_COLUMNS = [
  "price",
  "change_pct",
  "market_cap",
  "pe",
  "roe",
  "roce",
  "debt_equity",
  "div_yield",
  "sales_cagr_3y",
  "return_1y",
  "rsi",
]
