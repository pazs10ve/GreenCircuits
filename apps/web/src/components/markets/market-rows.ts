import type { SizeBand } from "@greencircuits/market/catalog"

/** What the overview needs for each stock besides its live quote, put together on the server. */
export interface MarketRow {
  id: number
  sector: string
  size: SizeBand | null
  /** At the last close; weights a sector's or a size band's move. */
  mcapCr: number
  sma50: number | null
  sma200: number | null
  high52: number | null
  low52: number | null
  /** Changes over the last week, month and year, in per cent. */
  week: number | null
  month: number | null
  year: number | null
}

/** Latest institutional money in the cash market, ₹ crore a day. */
export interface FlowDay {
  date: string
  fpiCash: number
  diiCash: number
}
