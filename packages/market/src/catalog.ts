import type { Instrument, Sector } from "./types"

/**
 * The simulated universe. Symbols and company names are real; prices, volumes
 * and index membership are sample values that anchor the simulator.
 */

export const INDEX = {
  NIFTY: 1,
  SENSEX: 2,
  BANKNIFTY: 3,
  NIFTYIT: 4,
  MIDCAP: 5,
  FINNIFTY: 6,
  VIX: 7,
} as const

/** NSE equity tick sizes by price band (revised monthly since April 2025). */
export function tickFor(price: number): number {
  if (price < 250) return 0.01
  if (price < 1000) return 0.05
  if (price < 5000) return 0.1
  if (price < 10000) return 0.5
  if (price < 20000) return 1
  return 5
}

export function slugify(symbol: string): string {
  return symbol.toLowerCase().replace(/&/g, "-and-").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

const indexRows: Omit<Instrument, "slug">[] = [
  { id: INDEX.NIFTY, symbol: "NIFTY 50", name: "Nifty 50", exchange: "NSE", kind: "INDEX", prevClose: 25114.2, vol: 0.13, beta: 1, tick: 0.05, avgVolume: 0, lot: 65, isFo: true },
  { id: INDEX.SENSEX, symbol: "SENSEX", name: "BSE Sensex", exchange: "BSE", kind: "INDEX", prevClose: 82012.66, vol: 0.13, beta: 1, tick: 0.05, avgVolume: 0, lot: 20, isFo: true },
  { id: INDEX.BANKNIFTY, symbol: "BANK NIFTY", name: "Nifty Bank", exchange: "NSE", kind: "INDEX", prevClose: 55340.1, vol: 0.15, beta: 1.1, tick: 0.05, avgVolume: 0, lot: 30, isFo: true },
  { id: INDEX.NIFTYIT, symbol: "NIFTY IT", name: "Nifty IT", exchange: "NSE", kind: "INDEX", prevClose: 36542.35, vol: 0.2, beta: 0.8, tick: 0.05, avgVolume: 0 },
  { id: INDEX.MIDCAP, symbol: "NIFTY MIDCAP 100", name: "Nifty Midcap 100", exchange: "NSE", kind: "INDEX", prevClose: 57418.9, vol: 0.17, beta: 1.15, tick: 0.05, avgVolume: 0 },
  { id: INDEX.FINNIFTY, symbol: "FIN NIFTY", name: "Nifty Financial Services", exchange: "NSE", kind: "INDEX", prevClose: 26482.75, vol: 0.14, beta: 1.05, tick: 0.05, avgVolume: 0, lot: 60, isFo: true },
  { id: INDEX.VIX, symbol: "INDIA VIX", name: "India VIX", exchange: "NSE", kind: "INDEX", prevClose: 11.92, vol: 0.75, beta: -4, tick: 0.0025, avgVolume: 0 },
]
const indices: Instrument[] = indexRows.map((i) => ({ ...i, slug: slugify(i.symbol) }))

// symbol, name, sector, industry, prevClose, shares (crore), vol, beta, avg volume (lakh shares), in Sensex
type Row = [string, string, Sector, string, number, number, number, number, number, boolean]

const rows: Row[] = [
  ["RELIANCE", "Reliance Industries", "Energy", "Oil, Gas & Consumable Fuels", 1412.6, 1353, 0.22, 1.0, 98, true],
  ["HDFCBANK", "HDFC Bank", "Financials", "Private Sector Bank", 986.4, 1535, 0.18, 0.95, 172, true],
  ["BHARTIARTL", "Bharti Airtel", "Telecom", "Telecom Services", 1921.3, 600, 0.21, 0.8, 64, true],
  ["TCS", "Tata Consultancy Services", "IT", "IT Services", 3065.5, 362, 0.2, 0.7, 28, true],
  ["ICICIBANK", "ICICI Bank", "Financials", "Private Sector Bank", 1411.8, 713, 0.19, 1.05, 131, true],
  ["SBIN", "State Bank of India", "Financials", "Public Sector Bank", 812.35, 892, 0.24, 1.2, 146, true],
  ["INFY", "Infosys", "IT", "IT Services", 1480.2, 415, 0.22, 0.75, 74, true],
  ["BAJFINANCE", "Bajaj Finance", "Financials", "Non Banking Financial Company", 948.15, 620, 0.28, 1.3, 88, true],
  ["HINDUNILVR", "Hindustan Unilever", "Consumer", "Personal Products", 2481.9, 235, 0.17, 0.55, 17, true],
  ["ITC", "ITC", "Consumer", "Cigarettes & Tobacco Products", 410.45, 1251, 0.18, 0.6, 142, true],
  ["LT", "Larsen & Toubro", "Industrials", "Civil Construction", 3622.4, 137.5, 0.22, 1.1, 21, true],
  ["HCLTECH", "HCL Technologies", "IT", "IT Services", 1450.6, 271, 0.23, 0.75, 35, true],
  ["KOTAKBANK", "Kotak Mahindra Bank", "Financials", "Private Sector Bank", 2010.5, 199, 0.2, 0.95, 31, true],
  ["SUNPHARMA", "Sun Pharmaceutical Industries", "Healthcare", "Pharmaceuticals", 1641.25, 240, 0.21, 0.55, 22, true],
  ["MARUTI", "Maruti Suzuki India", "Auto", "Passenger Cars & Utility Vehicles", 15902, 31.4, 0.23, 0.9, 5, true],
  ["M&M", "Mahindra & Mahindra", "Auto", "Passenger Cars & Utility Vehicles", 3451.7, 124, 0.26, 1.1, 24, true],
  ["AXISBANK", "Axis Bank", "Financials", "Private Sector Bank", 1150.3, 310, 0.23, 1.15, 69, true],
  ["ULTRACEMCO", "UltraTech Cement", "Materials", "Cement & Cement Products", 12304, 29.5, 0.22, 0.9, 3, true],
  ["NTPC", "NTPC", "Utilities", "Power Generation", 340.25, 970, 0.24, 0.85, 118, true],
  ["BAJAJFINSV", "Bajaj Finserv", "Financials", "Holding Company", 2010.8, 160, 0.26, 1.2, 12, true],
  ["TITAN", "Titan Company", "Consumer", "Gems, Jewellery & Watches", 3552.1, 89, 0.24, 0.9, 11, true],
  ["ETERNAL", "Eternal", "Consumer", "E-Retail", 330.45, 965, 0.38, 1.4, 390, true],
  ["ONGC", "Oil & Natural Gas Corporation", "Energy", "Oil Exploration & Production", 240.18, 1258, 0.27, 0.9, 162, false],
  ["ADANIPORTS", "Adani Ports & SEZ", "Industrials", "Port & Port Services", 1420.9, 216, 0.3, 1.3, 38, true],
  ["POWERGRID", "Power Grid Corporation", "Utilities", "Power Transmission", 290.35, 930, 0.2, 0.7, 104, true],
  ["BEL", "Bharat Electronics", "Industrials", "Aerospace & Defense", 405.6, 731, 0.32, 1.2, 205, true],
  ["WIPRO", "Wipro", "IT", "IT Services", 245.62, 1047, 0.24, 0.8, 96, false],
  ["JSWSTEEL", "JSW Steel", "Materials", "Iron & Steel", 1150.4, 244, 0.28, 1.25, 29, false],
  ["COALINDIA", "Coal India", "Energy", "Coal", 390.15, 616, 0.26, 0.85, 72, false],
  ["TATASTEEL", "Tata Steel", "Materials", "Iron & Steel", 168.42, 1248, 0.3, 1.35, 330, true],
  ["ASIANPAINT", "Asian Paints", "Consumer", "Paints", 2481.3, 96, 0.22, 0.7, 14, true],
  ["NESTLEIND", "Nestle India", "Consumer", "Packaged Foods", 1180.6, 193, 0.18, 0.5, 11, true],
  ["TRENT", "Trent", "Consumer", "Speciality Retail", 4951.5, 35.5, 0.35, 1.3, 9, true],
  ["GRASIM", "Grasim Industries", "Materials", "Cement & Cement Products", 2781.2, 68, 0.24, 1.0, 7, false],
  ["HINDALCO", "Hindalco Industries", "Materials", "Aluminium", 760.3, 225, 0.3, 1.3, 64, false],
  ["TECHM", "Tech Mahindra", "IT", "IT Services", 1480.9, 98, 0.26, 0.85, 26, true],
  ["SBILIFE", "SBI Life Insurance", "Financials", "Life Insurance", 1810.4, 100, 0.22, 0.75, 9, false],
  ["HDFCLIFE", "HDFC Life Insurance", "Financials", "Life Insurance", 765.2, 215, 0.23, 0.75, 25, false],
  ["CIPLA", "Cipla", "Healthcare", "Pharmaceuticals", 1520.8, 80.8, 0.22, 0.5, 15, false],
  ["DRREDDY", "Dr. Reddy's Laboratories", "Healthcare", "Pharmaceuticals", 1250.4, 83.4, 0.22, 0.5, 18, false],
  ["EICHERMOT", "Eicher Motors", "Auto", "2/3 Wheelers", 6902, 27.4, 0.26, 0.95, 5, false],
  ["BAJAJ-AUTO", "Bajaj Auto", "Auto", "2/3 Wheelers", 8904.5, 27.9, 0.24, 0.85, 4, false],
  ["HEROMOTOCO", "Hero MotoCorp", "Auto", "2/3 Wheelers", 5301, 20, 0.27, 0.9, 6, false],
  ["APOLLOHOSP", "Apollo Hospitals", "Healthcare", "Hospital", 7702.5, 14.4, 0.25, 0.7, 4, false],
  ["TATACONSUM", "Tata Consumer Products", "Consumer", "Tea & Coffee", 1110.2, 99, 0.24, 0.7, 15, false],
  ["SHRIRAMFIN", "Shriram Finance", "Financials", "Non Banking Financial Company", 640.55, 188, 0.32, 1.3, 58, false],
  ["JIOFIN", "Jio Financial Services", "Financials", "Holding Company", 305.4, 635, 0.33, 1.2, 190, false],
  ["ADANIENT", "Adani Enterprises", "Industrials", "Trading & Distributors", 2401.6, 115, 0.38, 1.45, 24, true],
  ["BRITANNIA", "Britannia Industries", "Consumer", "Packaged Foods", 5902, 24, 0.19, 0.5, 3, false],
]

const bankSymbols = new Set(["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK"])

const equities: Instrument[] = rows.map((r, i) => {
  const [symbol, name, sector, industry, prevClose, sharesCr, vol, beta, avgLakh, inSensex] = r
  const memberOf: number[] = [INDEX.NIFTY]
  if (inSensex) memberOf.push(INDEX.SENSEX)
  if (bankSymbols.has(symbol)) memberOf.push(INDEX.BANKNIFTY)
  if (sector === "IT") memberOf.push(INDEX.NIFTYIT)
  if (sector === "Financials") memberOf.push(INDEX.FINNIFTY)
  return {
    id: 100 + i,
    symbol,
    name,
    slug: slugify(symbol),
    exchange: "NSE",
    kind: "EQUITY",
    sector,
    industry,
    prevClose,
    vol,
    beta,
    tick: tickFor(prevClose),
    sharesCr,
    avgVolume: avgLakh * 1e5,
    isFo: true,
    indices: memberOf,
  }
})

const commodities: Instrument[] = [
  { id: 300, symbol: "GOLD", name: "Gold", unit: "₹ / 10 g", prevClose: 109850, vol: 0.14, beta: -0.1, tick: 1, lot: 1, avgVolume: 14000 },
  { id: 301, symbol: "SILVER", name: "Silver", unit: "₹ / kg", prevClose: 131400, vol: 0.24, beta: 0.1, tick: 1, lot: 30, avgVolume: 21000 },
  { id: 302, symbol: "CRUDEOIL", name: "Crude Oil", unit: "₹ / bbl", prevClose: 5540, vol: 0.32, beta: 0.2, tick: 1, lot: 100, avgVolume: 48000 },
  { id: 303, symbol: "NATURALGAS", name: "Natural Gas", unit: "₹ / mmBtu", prevClose: 268.4, vol: 0.55, beta: 0.1, tick: 0.1, lot: 1250, avgVolume: 91000 },
  { id: 304, symbol: "COPPER", name: "Copper", unit: "₹ / kg", prevClose: 882.5, vol: 0.22, beta: 0.35, tick: 0.05, lot: 2500, avgVolume: 12000 },
  { id: 305, symbol: "ZINC", name: "Zinc", unit: "₹ / kg", prevClose: 274.9, vol: 0.22, beta: 0.3, tick: 0.05, lot: 5000, avgVolume: 6000 },
  { id: 306, symbol: "ALUMINIUM", name: "Aluminium", unit: "₹ / kg", prevClose: 245.6, vol: 0.2, beta: 0.3, tick: 0.05, lot: 5000, avgVolume: 5000 },
].map((c) => ({ ...c, slug: slugify(c.symbol), exchange: "MCX" as const, kind: "COMMODITY" as const, isFo: true }))

const currencies: Instrument[] = [
  { id: 400, symbol: "USDINR", name: "US Dollar / Rupee", prevClose: 88.2125, vol: 0.04, beta: -0.15, tick: 0.0025, lot: 1000, avgVolume: 1800000 },
  { id: 401, symbol: "EURINR", name: "Euro / Rupee", prevClose: 103.415, vol: 0.06, beta: -0.1, tick: 0.0025, lot: 1000, avgVolume: 150000 },
  { id: 402, symbol: "GBPINR", name: "Pound / Rupee", prevClose: 118.6275, vol: 0.07, beta: -0.1, tick: 0.0025, lot: 1000, avgVolume: 90000 },
].map((c) => ({ ...c, slug: slugify(c.symbol), exchange: "NSE" as const, kind: "CURRENCY" as const, isFo: true }))

export const INSTRUMENTS: Instrument[] = [...indices, ...equities, ...commodities, ...currencies]

const byId = new Map(INSTRUMENTS.map((i) => [i.id, i]))
const bySlug = new Map(INSTRUMENTS.map((i) => [i.slug, i]))

export function getInstrument(id: number): Instrument | undefined {
  return byId.get(id)
}

export function getInstrumentBySlug(slug: string): Instrument | undefined {
  return bySlug.get(slug.toLowerCase())
}

export const EQUITIES = equities
export const INDICES = indices
export const COMMODITIES = commodities
export const CURRENCIES = currencies

/** Headline instruments for the top-bar ticker. */
export const TICKER_IDS = [INDEX.NIFTY, INDEX.SENSEX, INDEX.BANKNIFTY, INDEX.NIFTYIT, INDEX.VIX, 400, 300, 302]

export function membersOf(indexId: number): Instrument[] {
  return equities.filter((e) => e.indices?.includes(indexId))
}

/** Market cap in crore at a given price. */
export function marketCapCr(instrument: Instrument, price: number): number {
  return (instrument.sharesCr ?? 0) * price
}

export const SECTORS: Sector[] = [
  "Financials", "IT", "Energy", "Consumer", "Auto", "Healthcare", "Materials", "Industrials", "Telecom", "Utilities",
]

/** Derivative underlyings with option chains. */
export const OPTION_UNDERLYINGS = [INDEX.NIFTY, INDEX.BANKNIFTY, INDEX.FINNIFTY, INDEX.SENSEX, 100, 104, 106, 102, 105]
