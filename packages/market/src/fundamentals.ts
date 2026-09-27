import { between, gaussian, rngFor } from "./random"
import { EQUITIES, marketCapCr } from "./catalog"
import { dailyCandles } from "./history"
import type { Instrument, Sector } from "./types"

/**
 * Sample fundamentals, generated deterministically from each company's sector
 * profile and market cap. Shapes match what the fundamentals pipeline will
 * serve (Indian FY: April–March), so pages built on this switch over cleanly.
 */

interface SectorProfile {
  ps: [number, number] // price / sales
  opm: [number, number] // operating margin %
  npm: [number, number] // net margin %
  roe: [number, number]
  growth: [number, number] // revenue growth % per year
  debtEquity: [number, number]
  payout: [number, number]
}

const PROFILE: Record<Sector, SectorProfile> = {
  Financials: { ps: [3.5, 6.5], opm: [30, 45], npm: [18, 28], roe: [12, 19], growth: [12, 22], debtEquity: [0, 0], payout: [10, 25] },
  IT: { ps: [3.2, 5.8], opm: [19, 27], npm: [14, 20], roe: [20, 45], growth: [5, 13], debtEquity: [0, 0.1], payout: [45, 85] },
  Energy: { ps: [0.6, 2.2], opm: [11, 22], npm: [6, 12], roe: [9, 17], growth: [4, 12], debtEquity: [0.3, 0.8], payout: [25, 50] },
  Consumer: { ps: [4, 11], opm: [15, 26], npm: [10, 17], roe: [18, 45], growth: [8, 18], debtEquity: [0, 0.2], payout: [50, 85] },
  Auto: { ps: [1.4, 3.4], opm: [11, 21], npm: [7, 13], roe: [14, 26], growth: [8, 18], debtEquity: [0, 0.4], payout: [25, 55] },
  Healthcare: { ps: [3.8, 7], opm: [20, 29], npm: [13, 20], roe: [13, 20], growth: [8, 15], debtEquity: [0, 0.2], payout: [15, 35] },
  Materials: { ps: [0.9, 3], opm: [12, 22], npm: [5, 12], roe: [9, 18], growth: [5, 14], debtEquity: [0.3, 1.1], payout: [15, 35] },
  Industrials: { ps: [1.6, 6], opm: [10, 22], npm: [6, 14], roe: [12, 22], growth: [10, 20], debtEquity: [0.2, 0.9], payout: [15, 35] },
  Telecom: { ps: [4.5, 6.5], opm: [48, 54], npm: [10, 17], roe: [18, 26], growth: [12, 18], debtEquity: [1.2, 1.8], payout: [15, 30] },
  Utilities: { ps: [1.6, 3], opm: [28, 38], npm: [11, 16], roe: [11, 15], growth: [6, 11], debtEquity: [1.2, 1.7], payout: [35, 55] },
}

const PROMOTER: Record<string, number> = {
  RELIANCE: 50.1, HDFCBANK: 0, BHARTIARTL: 53.8, TCS: 71.8, ICICIBANK: 0, SBIN: 57.5, INFY: 14.4, BAJFINANCE: 54.7,
  HINDUNILVR: 61.9, ITC: 0, LT: 0, HCLTECH: 60.8, KOTAKBANK: 25.9, SUNPHARMA: 54.5, MARUTI: 58.3, "M&M": 18.5,
  AXISBANK: 8.2, ULTRACEMCO: 59.2, NTPC: 51.1, BAJAJFINSV: 60.6, TITAN: 52.9, ETERNAL: 0, ONGC: 58.9, ADANIPORTS: 65.9,
  POWERGRID: 51.3, BEL: 51.1, WIPRO: 72.7, JSWSTEEL: 45.3, COALINDIA: 63.1, TATASTEEL: 33.2, ASIANPAINT: 52.6,
  NESTLEIND: 62.8, TRENT: 37.0, GRASIM: 43.1, HINDALCO: 34.6, TECHM: 35.0, SBILIFE: 55.4, HDFCLIFE: 50.3, CIPLA: 30.9,
  DRREDDY: 26.6, EICHERMOT: 49.1, "BAJAJ-AUTO": 55.0, HEROMOTOCO: 34.7, APOLLOHOSP: 29.3, TATACONSUM: 33.8,
  SHRIRAMFIN: 25.4, JIOFIN: 47.1, ADANIENT: 73.9, BRITANNIA: 50.6,
}

export const FY_LABELS = ["FY22", "FY23", "FY24", "FY25", "FY26"]
export const QUARTER_LABELS = ["Q2 FY25", "Q3 FY25", "Q4 FY25", "Q1 FY26", "Q2 FY26", "Q3 FY26", "Q4 FY26", "Q1 FY27"]

export interface PeriodRow {
  label: string
  revenue: number
  expenses: number
  operatingProfit: number
  opm: number
  otherIncome: number
  depreciation: number
  interest: number
  pbt: number
  tax: number
  netProfit: number
  eps: number
}

export interface BalanceSheetRow {
  label: string
  equityCapital: number
  reserves: number
  borrowings: number
  otherLiabilities: number
  total: number
  fixedAssets: number
  cwip: number
  investments: number
  otherAssets: number
}

export interface CashFlowRow {
  label: string
  operating: number
  investing: number
  financing: number
  net: number
}

export interface Shareholding {
  label: string
  promoter: number
  fpi: number
  dii: number
  government: number
  retail: number
  pledged: number
}

export interface Fundamentals {
  symbol: string
  about: string
  faceValue: number
  bookValue: number
  ttmRevenue: number
  ttmProfit: number
  epsTtm: number
  pe: number
  pb: number
  roe: number
  roce: number
  opm: number
  npm: number
  debtEquity: number | null
  dividendYield: number
  salesCagr3y: number
  profitCagr3y: number
  quarters: PeriodRow[]
  annual: PeriodRow[]
  balanceSheet: BalanceSheetRow[]
  cashFlow: CashFlowRow[]
  shareholding: Shareholding[]
}

const cache = new Map<number, Fundamentals>()

function periodRow(label: string, revenue: number, opm: number, npm: number, shares: number, rng: () => number): PeriodRow {
  const operatingProfit = revenue * (opm / 100)
  const expenses = revenue - operatingProfit
  const otherIncome = revenue * between(rng, 0.01, 0.04)
  const netProfit = revenue * (npm / 100)
  const tax = netProfit * 0.33
  const pbt = netProfit + tax
  const depreciation = revenue * between(rng, 0.02, 0.06)
  const interest = Math.max(0, operatingProfit + otherIncome - depreciation - pbt)
  return {
    label,
    revenue,
    expenses,
    operatingProfit,
    opm,
    otherIncome,
    depreciation,
    interest,
    pbt,
    tax,
    netProfit,
    eps: netProfit / shares,
  }
}

export function getFundamentals(inst: Instrument): Fundamentals {
  const hit = cache.get(inst.id)
  if (hit) return hit
  const rng = rngFor(inst.symbol, 0xf00d)
  const p = PROFILE[inst.sector ?? "Industrials"]
  const shares = inst.sharesCr ?? 100
  const mcap = marketCapCr(inst, inst.prevClose)
  const ttmRevenue = mcap / between(rng, ...p.ps)
  const opm = between(rng, ...p.opm)
  const npm = Math.min(opm - 2, between(rng, ...p.npm))
  const growth = between(rng, ...p.growth) / 100

  // Quarterly: the last four quarters sum to the TTM revenue.
  const qGrowth = Math.pow(1 + growth, 0.25) - 1
  const lastQ = (ttmRevenue / 4) * (1 + qGrowth * 1.5)
  const quarters: PeriodRow[] = QUARTER_LABELS.map((label, i) => {
    const back = QUARTER_LABELS.length - 1 - i
    const rev = lastQ / Math.pow(1 + qGrowth, back) * (1 + gaussian(rng) * 0.03)
    return periodRow(label, rev, opm + gaussian(rng) * 1.2, npm + gaussian(rng) * 1.1, shares, rng)
  })
  const ttm = quarters.slice(-4)
  const ttmProfit = ttm.reduce((s, q) => s + q.netProfit, 0)
  const epsTtm = ttmProfit / shares

  const annual: PeriodRow[] = FY_LABELS.map((label, i) => {
    const back = FY_LABELS.length - 1 - i
    const rev = (ttmRevenue * 0.97) / Math.pow(1 + growth, back) * (1 + gaussian(rng) * 0.025)
    return periodRow(label, rev, opm + gaussian(rng) * 1.5, npm + gaussian(rng) * 1.3, shares, rng)
  })

  const roe = between(rng, ...p.roe)
  const netWorth = ttmProfit / (roe / 100)
  const de = between(rng, ...p.debtEquity)
  const borrowings = netWorth * de
  const faceValue = [1, 2, 5, 10][Math.floor(rng() * 4)]!
  const equityCapital = (shares * faceValue) / 1
  const balanceSheet: BalanceSheetRow[] = FY_LABELS.map((label, i) => {
    const scale = 1 / Math.pow(1 + growth * 0.8, FY_LABELS.length - 1 - i)
    const reserves = netWorth * scale - equityCapital
    const borrow = borrowings * scale * (1 + gaussian(rng) * 0.05)
    const otherLiabilities = netWorth * scale * between(rng, 0.25, 0.6)
    const total = equityCapital + reserves + borrow + otherLiabilities
    const fixedAssets = total * between(rng, 0.3, 0.5)
    const cwip = total * between(rng, 0.02, 0.08)
    const investments = total * between(rng, 0.1, 0.25)
    return {
      label,
      equityCapital,
      reserves,
      borrowings: borrow,
      otherLiabilities,
      total,
      fixedAssets,
      cwip,
      investments,
      otherAssets: total - fixedAssets - cwip - investments,
    }
  })
  const cashFlow: CashFlowRow[] = annual.map((a) => {
    const operating = (a.netProfit + a.depreciation) * between(rng, 0.85, 1.2)
    const investing = -operating * between(rng, 0.5, 0.9)
    const financing = -operating * between(rng, 0.1, 0.4)
    return { label: a.label, operating, investing, financing, net: operating + investing + financing }
  })

  const promoter = PROMOTER[inst.symbol] ?? 45
  const pledgedBase = inst.symbol.startsWith("ADANI") ? 4.5 : 0
  const shareholding: Shareholding[] = QUARTER_LABELS.map((label, i) => {
    const drift = (i - QUARTER_LABELS.length + 1) * 0.15
    const prom = Math.max(0, promoter - (promoter > 0 ? drift * 0.2 : 0))
    const rest = 100 - prom
    const government = inst.symbol === "SBIN" || inst.symbol === "ONGC" ? 0 : rest * 0.01
    const fpi = rest * (0.42 + drift * 0.01 + gaussian(rng) * 0.01)
    const dii = rest * (0.33 - drift * 0.012 + gaussian(rng) * 0.01)
    return {
      label,
      promoter: prom,
      fpi,
      dii,
      government,
      retail: 100 - prom - fpi - dii - government,
      pledged: Math.max(0, pledgedBase + gaussian(rng) * 0.2 * (pledgedBase > 0 ? 1 : 0)),
    }
  })

  const three = annual.length - 4
  const salesCagr3y = (Math.pow(annual.at(-1)!.revenue / annual[three]!.revenue, 1 / 3) - 1) * 100
  const profitCagr3y = (Math.pow(annual.at(-1)!.netProfit / annual[three]!.netProfit, 1 / 3) - 1) * 100
  const bookValue = netWorth / shares
  const dps = epsTtm * (between(rng, ...p.payout) / 100)

  const f: Fundamentals = {
    symbol: inst.symbol,
    about: `${inst.name} operates in ${inst.industry?.toLowerCase() ?? "its industry"}, within the ${inst.sector?.toLowerCase()} sector. Listed on NSE and BSE and part of the Nifty 50.`,
    faceValue,
    bookValue,
    ttmRevenue,
    ttmProfit,
    epsTtm,
    pe: inst.prevClose / epsTtm,
    pb: inst.prevClose / bookValue,
    roe,
    roce: roe * between(rng, 1.05, 1.35),
    opm,
    npm,
    debtEquity: inst.sector === "Financials" ? null : de,
    dividendYield: (dps / inst.prevClose) * 100,
    salesCagr3y,
    profitCagr3y,
    quarters,
    annual,
    balanceSheet,
    cashFlow,
    shareholding,
  }
  cache.set(inst.id, f)
  return f
}

/** RSI(14) on daily closes. */
function rsi(closes: number[], period = 14): number {
  let gain = 0
  let loss = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!
    if (d > 0) gain += d
    else loss -= d
  }
  if (loss === 0) return 100
  const rs = gain / loss
  return 100 - 100 / (1 + rs)
}

function sma(closes: number[], n: number): number {
  const s = closes.slice(-n)
  return s.reduce((a, b) => a + b, 0) / s.length
}

/** Real data has gaps (no P/E for a loss, no three-year growth for a recent listing), so every figure can be null. */
export interface ScreenRow {
  id: number
  symbol: string
  name: string
  sector: Sector
  mcapCr: number | null
  pe: number | null
  pb: number | null
  roe: number | null
  roce: number | null
  opm: number | null
  debtEquity: number | null
  divYield: number | null
  salesCagr3y: number | null
  profitCagr3y: number | null
  promoter: number | null
  pledged: number | null
  rsi14: number | null
  sma50: number | null
  sma200: number | null
  return1m: number | null
  return1y: number | null
  high52: number | null
  low52: number | null
  fromHigh52: number | null
}

let screenCache: ScreenRow[] | undefined

/** One typed row per stock, the shape of scr.equity_snapshot. Uses yesterday's close. */
export function screenerSnapshot(): ScreenRow[] {
  if (screenCache) return screenCache
  screenCache = EQUITIES.map((inst) => {
    const f = getFundamentals(inst)
    const candles = dailyCandles(inst, 260)
    const closes = candles.map((c) => c.close)
    const last = closes.at(-1)!
    const year = candles.slice(-250)
    const high52 = Math.max(...year.map((c) => c.high))
    const low52 = Math.min(...year.map((c) => c.low))
    const sh = f.shareholding.at(-1)!
    return {
      id: inst.id,
      symbol: inst.symbol,
      name: inst.name,
      sector: inst.sector!,
      mcapCr: marketCapCr(inst, inst.prevClose),
      pe: f.pe,
      pb: f.pb,
      roe: f.roe,
      roce: f.roce,
      opm: f.opm,
      debtEquity: f.debtEquity,
      divYield: f.dividendYield,
      salesCagr3y: f.salesCagr3y,
      profitCagr3y: f.profitCagr3y,
      promoter: sh.promoter,
      pledged: sh.pledged,
      rsi14: rsi(closes),
      sma50: sma(closes, 50),
      sma200: sma(closes, 200),
      return1m: (last / closes.at(-22)! - 1) * 100,
      return1y: (last / closes.at(-250)! - 1) * 100,
      high52,
      low52,
      fromHigh52: (last / high52 - 1) * 100,
    }
  })
  return screenCache
}

export function peersOf(inst: Instrument, limit = 6): Instrument[] {
  return EQUITIES.filter((e) => e.sector === inst.sector)
    .sort((a, b) => marketCapCr(b, b.prevClose) - marketCapCr(a, a.prevClose))
    .slice(0, limit)
}
