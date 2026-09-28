import { between, gaussian, mulberry32, rngFor, roundTo } from "./random"
import { COMMODITIES, EQUITIES } from "./catalog"
import type { Instrument } from "./types"

/**
 * Sample reference data for the pages that the batch pipelines will feed:
 * IPOs, bonds and yield curves, institutional flows, the events calendar and
 * commodity term structures. IPO companies are fictional; bond issuers are
 * real names with sample terms.
 */

const DAY = 86400000

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY)
}

/** Next weekday on or after the date. */
function weekday(date: Date): Date {
  const d = new Date(date)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

function todayUTC(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

// ---------------------------------------------------------------------- IPOs

export type IpoStatus = "UPCOMING" | "OPEN" | "CLOSED" | "LISTED"

export interface IpoCategory {
  code: "QIB" | "NII" | "RETAIL" | "EMPLOYEE"
  label: string
  times: number
}

export interface Ipo {
  id: string
  name: string
  sector: string
  board: "MAINBOARD" | "SME"
  status: IpoStatus
  priceLow: number
  priceHigh: number
  lot: number
  issueSizeCr: number
  freshCr: number
  ofsCr: number
  open: Date
  close: Date
  allotment: Date
  listing: Date
  subscription: IpoCategory[]
  listingPrice?: number
  lastPrice?: number
  registrar: string
  leadManagers: string[]
  about: string
}

const IPO_SEEDS: Array<[string, string, "MAINBOARD" | "SME", number, number, number]> = [
  // name, sector, board, day offset of open (relative to today), price high, issue size (₹ Cr)
  ["Tarang Mobility", "EV components", "MAINBOARD", 9, 412, 1850],
  ["Vistaar Cold Chain", "Logistics", "MAINBOARD", 4, 268, 740],
  ["Nimbus Datacentres", "Data centres", "MAINBOARD", -1, 575, 3200],
  ["Kalpa Specialty Chemicals", "Chemicals", "MAINBOARD", -2, 318, 960],
  ["Deccan Precision Components", "Engineering", "SME", 0, 96, 42],
  ["Saaransh Fintech", "Payments", "MAINBOARD", -9, 440, 2400],
  ["Meghna Agro Foods", "FMCG", "MAINBOARD", -18, 186, 620],
  ["Parvat Renewables", "Solar power", "MAINBOARD", -31, 152, 1350],
]

const registrars = ["KFin Technologies", "MUFG Intime India", "Bigshare Services"]
const managers = ["Kotak Mahindra Capital", "Axis Capital", "ICICI Securities", "JM Financial", "IIFL Capital", "SBI Capital Markets"]

export function getIpos(now = new Date()): Ipo[] {
  const today = todayUTC(now)
  return IPO_SEEDS.map(([name, sector, board, offset, priceHigh, size], idx) => {
    const rng = rngFor(name, 0x1b0)
    const open = weekday(addDays(today, offset))
    const close = weekday(addDays(open, 2))
    const allotment = weekday(addDays(close, 1))
    const listing = weekday(addDays(allotment, 2))
    const t = today.getTime()
    const status: IpoStatus =
      t < open.getTime() ? "UPCOMING" : t <= close.getTime() ? "OPEN" : t < listing.getTime() ? "CLOSED" : "LISTED"
    const priceLow = roundTo(priceHigh * 0.95, 1)
    const lot = board === "SME" ? 1200 : Math.max(1, Math.round(14800 / priceHigh))
    const fresh = roundTo(size * between(rng, 0.3, 0.8), 1)
    const demand = status === "UPCOMING" ? 0 : status === "OPEN" ? between(rng, 0.3, 1) : 1
    const hype = between(rng, 2, 60)
    const subscription: IpoCategory[] =
      board === "SME"
        ? [
            { code: "NII", label: "HNI", times: roundTo(hype * 1.8 * demand, 0.01) },
            { code: "RETAIL", label: "Retail", times: roundTo(hype * 1.2 * demand, 0.01) },
          ]
        : [
            { code: "QIB", label: "QIB", times: roundTo(hype * 1.6 * demand * (status === "OPEN" ? 0.3 : 1), 0.01) },
            { code: "NII", label: "NII", times: roundTo(hype * 1.1 * demand, 0.01) },
            { code: "RETAIL", label: "Retail", times: roundTo(hype * 0.45 * demand, 0.01) },
            { code: "EMPLOYEE", label: "Employee", times: roundTo(hype * 0.2 * demand, 0.01) },
          ]
    const listingPrice = status === "LISTED" ? roundTo(priceHigh * (1 + gaussian(rng) * 0.18 + 0.08), 0.05) : undefined
    return {
      id: `ipo-${idx + 1}`,
      name,
      sector,
      board,
      status,
      priceLow,
      priceHigh,
      lot,
      issueSizeCr: size,
      freshCr: fresh,
      ofsCr: roundTo(size - fresh, 1),
      open,
      close,
      allotment,
      listing,
      subscription,
      listingPrice,
      lastPrice: listingPrice ? roundTo(listingPrice * (1 + gaussian(rng) * 0.08), 0.05) : undefined,
      registrar: registrars[idx % registrars.length]!,
      leadManagers: [managers[idx % managers.length]!, managers[(idx + 2) % managers.length]!],
      about: `${name} is a sample ${board === "SME" ? "SME " : ""}issuer in ${sector.toLowerCase()}, used to demonstrate the IPO pages.`,
    }
  })
}

export function totalSubscription(ipo: Ipo): number {
  const weights: Record<IpoCategory["code"], number> = { QIB: 0.5, NII: 0.15, RETAIL: 0.35, EMPLOYEE: 0 }
  if (ipo.board === "SME") return ipo.subscription.reduce((s, c) => s + c.times, 0) / ipo.subscription.length
  return ipo.subscription.reduce((s, c) => s + c.times * weights[c.code], 0)
}

// --------------------------------------------------------------------- bonds

export type BondType = "G-Sec" | "SDL" | "T-Bill" | "SGB" | "Corporate" | "PSU"

export interface Bond {
  isin: string
  name: string
  issuer: string
  type: BondType
  coupon: number | null
  maturity: Date
  rating: string
  agency: string
  price: number
  ytm: number
  frequency: number
  secured: boolean
  taxFree: boolean
}

const BOND_ROWS: Array<[string, string, BondType, number | null, number, string, string]> = [
  ["7.18% GS 2033", "Government of India", "G-Sec", 7.18, 2033.6, "SOV", "–"],
  ["7.10% GS 2034", "Government of India", "G-Sec", 7.1, 2034.3, "SOV", "–"],
  ["6.79% GS 2034", "Government of India", "G-Sec", 6.79, 2034.8, "SOV", "–"],
  ["7.26% GS 2032", "Government of India", "G-Sec", 7.26, 2032.9, "SOV", "–"],
  ["7.09% GS 2054", "Government of India", "G-Sec", 7.09, 2054.7, "SOV", "–"],
  ["7.30% GS 2053", "Government of India", "G-Sec", 7.3, 2053.5, "SOV", "–"],
  ["182 Day T-Bill", "Government of India", "T-Bill", null, 0.5, "SOV", "–"],
  ["364 Day T-Bill", "Government of India", "T-Bill", null, 1, "SOV", "–"],
  ["7.45% Maharashtra SDL 2034", "Government of Maharashtra", "SDL", 7.45, 2034.2, "SOV", "–"],
  ["7.38% Tamil Nadu SDL 2035", "Government of Tamil Nadu", "SDL", 7.38, 2035.1, "SOV", "–"],
  ["SGB 2029-30 Series IV", "Reserve Bank of India", "SGB", 2.5, 2029.9, "SOV", "–"],
  ["7.52% REC 2033", "REC Ltd", "PSU", 7.52, 2033.4, "AAA", "CRISIL"],
  ["7.44% PFC 2034", "Power Finance Corporation", "PSU", 7.44, 2034.1, "AAA", "ICRA"],
  ["7.35% NABARD 2031", "NABARD", "PSU", 7.35, 2031.2, "AAA", "CRISIL"],
  ["7.29% IRFC 2035", "Indian Railway Finance Corporation", "PSU", 7.29, 2035.3, "AAA", "CARE"],
  ["7.85% Bajaj Finance 2029", "Bajaj Finance", "Corporate", 7.85, 2029.6, "AAA", "CRISIL"],
  ["7.70% HDFC Bank 2033", "HDFC Bank", "Corporate", 7.7, 2033.9, "AAA", "CRISIL"],
  ["7.95% Tata Capital 2030", "Tata Capital", "Corporate", 7.95, 2030.4, "AAA", "ICRA"],
  ["8.25% Shriram Finance 2028", "Shriram Finance", "Corporate", 8.25, 2028.8, "AA+", "CRISIL"],
  ["8.60% Muthoot Finance 2027", "Muthoot Finance", "Corporate", 8.6, 2027.9, "AA+", "ICRA"],
  ["7.62% Reliance Industries 2032", "Reliance Industries", "Corporate", 7.62, 2032.4, "AAA", "CARE"],
  ["9.10% IIFL Finance 2027", "IIFL Finance", "Corporate", 9.1, 2027.5, "AA", "CRISIL"],
]

function yearFrac(date: Date, now: Date): number {
  return (date.getTime() - now.getTime()) / (365.25 * DAY)
}

/** G-sec par curve; spreads by rating sit on top. */
export function gsecYield(years: number, shift = 0): number {
  const t = Math.max(0.1, years)
  // Nelson–Siegel-shaped curve: ~5.6% at the short end rising to ~7.1% long.
  const b0 = 7.15 + shift
  const b1 = -1.65
  const b2 = 0.9
  const tau = 2.8
  const x = t / tau
  const f = (1 - Math.exp(-x)) / x
  return b0 + b1 * f + b2 * (f - Math.exp(-x))
}

const SPREAD: Record<string, number> = { SOV: 0, AAA: 0.55, "AA+": 1.05, AA: 1.55 }

function priceFromYield(coupon: number, ytm: number, years: number, frequency: number): number {
  const n = Math.max(1, Math.round(years * frequency))
  const c = coupon / frequency
  const y = ytm / 100 / frequency
  let pv = 0
  for (let i = 1; i <= n; i++) pv += c / Math.pow(1 + y, i)
  pv += 100 / Math.pow(1 + y, n)
  return pv
}

export function getBonds(now = new Date()): Bond[] {
  return BOND_ROWS.map(([name, issuer, type, coupon, maturityYear, rating, agency], i) => {
    const rng = mulberry32(0xb0ad + i)
    const maturity =
      type === "T-Bill"
        ? new Date(now.getTime() + maturityYear * 365 * DAY)
        : new Date(Date.UTC(Math.floor(maturityYear), Math.round((maturityYear % 1) * 12), 15))
    const years = Math.max(0.1, yearFrac(maturity, now))
    const base = type === "SDL" ? 0.32 : type === "SGB" ? -4.4 : 0
    const ytm = gsecYield(years) + (SPREAD[rating] ?? 1.2) + base + gaussian(rng) * 0.04
    const frequency = type === "T-Bill" ? 0 : 2
    const price =
      coupon == null
        ? 100 / (1 + (ytm / 100) * years)
        : priceFromYield(coupon, ytm, years, frequency || 1)
    return {
      isin: `IN${(i * 7919 + 100003).toString().padStart(9, "0")}${i % 10}`.slice(0, 12),
      name,
      issuer,
      type,
      coupon,
      maturity,
      rating,
      agency,
      price: roundTo(price, 0.0001),
      ytm: roundTo(ytm, 0.0001),
      frequency,
      secured: type === "Corporate" || type === "PSU",
      taxFree: false,
    }
  })
}

export interface CurvePoint {
  tenor: number
  today: number
  /** Null where there's no curve from then: real data only builds its history a day at a time. */
  monthAgo: number | null
  yearAgo: number | null
}

export function yieldCurve(): CurvePoint[] {
  return [0.25, 0.5, 1, 2, 3, 5, 7, 10, 14, 20, 30, 40].map((t) => ({
    tenor: t,
    today: gsecYield(t),
    monthAgo: gsecYield(t, 0.06) + (t < 2 ? 0.08 : 0),
    yearAgo: gsecYield(t, 0.42) + (t < 3 ? 0.55 : 0.1),
  }))
}

/** Price and YTM calculator for the bond detail page. */
export function bondPrice(coupon: number, ytm: number, years: number, frequency = 2): number {
  return priceFromYield(coupon, ytm, years, frequency)
}

// --------------------------------------------------------- institutional flows

export interface FlowDay {
  date: Date
  fpiCash: number
  diiCash: number
}

export function institutionalFlows(days = 15, now = new Date()): FlowDay[] {
  const rng = mulberry32(0xf10f)
  const out: FlowDay[] = []
  let d = todayUTC(now)
  while (out.length < days) {
    d = addDays(d, -1)
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue
    const fpi = gaussian(rng) * 2400 - 450
    const dii = -fpi * 0.7 + gaussian(rng) * 900 + 600
    out.push({ date: d, fpiCash: Math.round(fpi), diiCash: Math.round(dii) })
  }
  return out.reverse()
}

// ------------------------------------------------------------ events calendar

export interface MarketEvent {
  date: Date
  kind: "RESULTS" | "EXPIRY" | "IPO" | "DIVIDEND" | "HOLIDAY"
  title: string
  detail: string
  instrumentId?: number
}

export function upcomingEvents(now = new Date()): MarketEvent[] {
  const today = todayUTC(now)
  const rng = mulberry32(0xe7e7)
  const events: MarketEvent[] = []
  const reporters = [...EQUITIES].sort(() => rng() - 0.5).slice(0, 9)
  reporters.forEach((inst, i) => {
    events.push({
      date: weekday(addDays(today, 2 + i * 2 + Math.floor(rng() * 2))),
      kind: "RESULTS",
      title: `${inst.name} results`,
      detail: "Q2 FY27 board meeting",
      instrumentId: inst.id,
    })
  })
  for (const inst of reporters.slice(0, 3)) {
    events.push({
      date: weekday(addDays(today, 6 + Math.floor(rng() * 10))),
      kind: "DIVIDEND",
      title: `${inst.name} goes ex-dividend`,
      detail: `Interim dividend ₹${roundTo(between(rng, 2, 25), 0.5)} per share`,
      instrumentId: inst.id,
    })
  }
  const nextTue = weekday(addDays(today, (2 - today.getUTCDay() + 7) % 7 || 7))
  events.push({ date: nextTue, kind: "EXPIRY", title: "NIFTY weekly expiry", detail: "NSE index options, 15:30 IST" })
  const nextThu = addDays(today, (4 - today.getUTCDay() + 7) % 7 || 7)
  events.push({ date: nextThu, kind: "EXPIRY", title: "SENSEX weekly expiry", detail: "BSE index options, 15:30 IST" })
  for (const ipo of getIpos(now).filter((i) => i.status === "UPCOMING" || i.status === "OPEN")) {
    events.push({
      date: ipo.status === "OPEN" ? ipo.close : ipo.open,
      kind: "IPO",
      title: `${ipo.name} IPO ${ipo.status === "OPEN" ? "closes" : "opens"}`,
      detail: `₹${ipo.priceLow}–${ipo.priceHigh} · lot ${ipo.lot}`,
    })
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime())
}

// ---------------------------------------------------- commodity term structure

export interface FuturesContract {
  instrument: Instrument
  expiry: Date
  label: string
  price: number
  oi: number
}

export function termStructure(inst: Instrument, spot: number, now = new Date()): FuturesContract[] {
  const rng = rngFor(inst.symbol, 0x7e7)
  const carry = inst.symbol === "NATURALGAS" ? 0.02 : inst.symbol === "CRUDEOIL" ? -0.004 : 0.006
  const out: FuturesContract[] = []
  for (let m = 0; m < 4; m++) {
    const expiry = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m + 1, 5, 18))
    const price = roundTo(spot * (1 + carry * m + gaussian(rng) * 0.001), inst.tick)
    out.push({
      instrument: inst,
      expiry,
      label: new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" }).format(expiry).toUpperCase(),
      price,
      oi: Math.round(inst.avgVolume * (1.4 / (m + 1)) * (0.8 + rng() * 0.4)),
    })
  }
  return out
}

export const COMMODITY_GROUPS: Record<string, string[]> = {
  Bullion: ["GOLD", "SILVER"],
  Energy: ["CRUDEOIL", "NATURALGAS"],
  "Base metals": ["COPPER", "ZINC", "ALUMINIUM"],
}

export function commodityBySymbol(symbol: string): Instrument | undefined {
  return COMMODITIES.find((c) => c.symbol === symbol)
}
