import { getIpos as demoIpos, type Ipo } from "@greencircuits/market/reference"
import { liveGet } from "./market"

export type IpoStatus = "UPCOMING" | "OPEN" | "CLOSED" | "LISTED"

/** An IPO as the page shows it: real data from NSE has less in it than the demo's, so most of it is optional. */
export interface IpoView {
  id: string
  name: string
  about?: string
  sector?: string
  board: "MAINBOARD" | "SME"
  status: IpoStatus
  priceLow?: number
  priceHigh?: number
  lot?: number
  sizeCr?: number
  freshCr?: number
  ofsCr?: number
  /** IST dates, YYYY-MM-DD. */
  open: string
  close: string
  allotment?: string
  listing?: string
  /** Times subscribed, by category; real data has only the total. */
  categories: { label: string; times: number }[]
  /** Times subscribed overall. */
  total?: number
  listingPrice?: number
  lastPrice?: number
  registrar?: string
  leadManagers?: string[]
}

interface ApiIpo {
  id: number
  name: string
  description: string | null
  board: "MAINBOARD" | "SME"
  status: IpoStatus
  price_band_low: number | null
  price_band_high: number | null
  lot_size: number | null
  total_issue_inr: number | null
  fresh_issue_inr: number | null
  ofs_inr: number | null
  open_date: string | null
  close_date: string | null
  allotment_date: string | null
  listing_date: string | null
  registrar: string | null
  lead_managers: string[] | null
  listing_price: number | null
  last_price: number | null
  subscription: Record<string, number>
}

const LABELS: Record<string, string> = { QIB: "Institutions", NII: "Wealthy individuals", RETAIL: "Retail", EMPLOYEE: "Employees" }
/** How SEBI splits a mainboard book: half for institutions, 15% for wealthy individuals, 35% for retail. */
const WEIGHTS: Record<string, number> = { QIB: 0.5, NII: 0.15, RETAIL: 0.35 }
const CRORE = 1e7
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** The status on `today`, from the dates: a stored status goes stale as the days pass. */
export function statusOn(ipo: Pick<IpoView, "open" | "close" | "listing">, today: string): IpoStatus {
  if (ipo.listing && ipo.listing <= today) return "LISTED"
  if (ipo.close < today) return "CLOSED"
  if (ipo.open > today) return "UPCOMING"
  return "OPEN"
}

function totalOf(board: IpoView["board"], categories: Record<string, number>): number | undefined {
  if (categories.TOTAL != null) return categories.TOTAL
  const entries = Object.entries(categories).filter(([code]) => code !== "EMPLOYEE")
  if (entries.length === 0) return undefined
  if (board === "SME") return entries.reduce((s, [, t]) => s + t, 0) / entries.length
  const weight = entries.reduce((s, [code]) => s + (WEIGHTS[code] ?? 0), 0)
  return weight ? entries.reduce((s, [code, t]) => s + t * (WEIGHTS[code] ?? 0), 0) / weight : undefined
}

function fromApi(x: ApiIpo, today: string): IpoView | null {
  if (!x.open_date || !x.close_date) return null
  const base = { open: x.open_date, close: x.close_date, listing: x.listing_date ?? undefined }
  const categories = Object.entries(x.subscription ?? {})
    .filter(([code]) => code !== "TOTAL")
    .map(([code, times]) => ({ label: LABELS[code] ?? code, times }))
  const size = x.total_issue_inr
  return {
    id: String(x.id),
    name: x.name,
    about: x.description ?? undefined,
    board: x.board,
    status: statusOn(base, today),
    priceLow: x.price_band_low ?? undefined,
    priceHigh: x.price_band_high ?? undefined,
    lot: x.lot_size ?? undefined,
    sizeCr: size ? size / CRORE : undefined,
    freshCr: x.fresh_issue_inr ? x.fresh_issue_inr / CRORE : undefined,
    ofsCr: x.ofs_inr ? x.ofs_inr / CRORE : undefined,
    ...base,
    allotment: x.allotment_date ?? undefined,
    categories,
    total: totalOf(x.board, x.subscription ?? {}),
    listingPrice: x.listing_price ?? undefined,
    lastPrice: x.last_price ?? undefined,
    registrar: x.registrar ?? undefined,
    leadManagers: x.lead_managers?.length ? x.lead_managers : undefined,
  }
}

function fromDemo(x: Ipo, today: string): IpoView {
  const base = { open: iso(x.open), close: iso(x.close), listing: iso(x.listing) }
  const status = statusOn(base, today)
  return {
    id: x.id,
    name: x.name,
    about: x.about,
    sector: x.sector,
    board: x.board,
    status,
    priceLow: x.priceLow,
    priceHigh: x.priceHigh,
    lot: x.lot,
    sizeCr: x.issueSizeCr,
    freshCr: x.freshCr,
    ofsCr: x.ofsCr,
    ...base,
    allotment: iso(x.allotment),
    categories: status === "UPCOMING" ? [] : x.subscription.map((c) => ({ label: LABELS[c.code] ?? c.label, times: c.times })),
    total: status === "UPCOMING" ? undefined : totalOf(x.board, Object.fromEntries(x.subscription.map((c) => [c.code, c.times]))),
    listingPrice: x.listingPrice,
    lastPrice: x.lastPrice,
    registrar: x.registrar,
    leadManagers: x.leadManagers,
  }
}

/** The IPO calendar: from the API (NSE's list, with real data) when the backend runs, else the demo's sample issues. */
export async function getIpoCalendar(today: string): Promise<{ ipos: IpoView[]; source: "api" | "demo" }> {
  const api = await liveGet<{ items: ApiIpo[] }>("/v1/ipos", { revalidate: 300 })
  if (api?.items.length) return { ipos: api.items.flatMap((x) => fromApi(x, today) ?? []), source: "api" }
  return { ipos: demoIpos(new Date(`${today}T06:30:00Z`)).map((x) => fromDemo(x, today)), source: "demo" }
}
