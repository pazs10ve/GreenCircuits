import { getBonds, yieldCurve, type BondType, type CurvePoint } from "@greencircuits/market/reference"
import type { BondRow } from "@/components/bonds/bond-math"
import { liveGet } from "./market"

const YEAR = 365.25 * 86_400_000
const DAY = 86_400_000

interface ApiBond {
  id: number
  isin: string | null
  name: string
  security_type: string
  issuer: string
  coupon_rate_pct: number | null
  maturity_date: string
  coupon_frequency: number
  face_value: number
  clean_price: number | null
  ytm_pct: number | null
  trade_date: string | null
  trades: number | null
  rating: string | null
  agency: string | null
}

interface ApiCurves {
  curves: { asOf: string; points: { tenor: number; yield: number }[] }[]
}

const TYPE: Record<string, BondType> = { GSEC: "G-Sec", SDL: "SDL", TBILL: "T-Bill", SGB: "SGB", CORPORATE_BOND: "Corporate" }

/** The curve nearest `days` back from the latest, within a week of it; null when there isn't one. */
function curveFrom(curves: ApiCurves["curves"], latest: string, days: number) {
  const target = Date.parse(latest) - days * DAY
  const near = curves
    .map((c) => ({ c, gap: Math.abs(Date.parse(c.asOf) - target) }))
    .filter((x) => x.gap <= 7 * DAY)
    .sort((a, b) => a.gap - b.gap)[0]
  return near ? new Map(near.c.points.map((p) => [p.tenor, p.yield])) : null
}

export interface BondsData {
  bonds: BondRow[]
  curve: CurvePoint[]
  /** Real bonds listed on NSE, or the demo's sample. */
  real: boolean
  /** The date of the prices, YYYY-MM-DD. */
  asOf: string | null
}

/** Bonds and the government's yield curve: NSE's listings through the API, else the demo's sample. */
export async function getBondsData(now: Date): Promise<BondsData> {
  const [api, curves] = await Promise.all([
    liveGet<{ asOf: string; items: ApiBond[] }>("/v1/bonds", { revalidate: 300 }),
    liveGet<ApiCurves>("/v1/yield-curve", { revalidate: 300 }),
  ])
  const latest = curves?.curves[0]
  if (api?.items.length && latest && api.items.some((b) => b.trade_date != null && (b.trades ?? 0) > 0)) {
    const month = curveFrom(curves.curves, latest.asOf, 30)
    const year = curveFrom(curves.curves, latest.asOf, 365)
    const curve: CurvePoint[] = latest.points.map((p) => ({
      tenor: p.tenor,
      today: p.yield,
      monthAgo: month?.get(p.tenor) ?? null,
      yearAgo: year?.get(p.tenor) ?? null,
    }))
    const bonds: BondRow[] = api.items.flatMap((b) => {
      const type = TYPE[b.security_type]
      if (!type) return []
      const maturity = new Date(`${b.maturity_date}T00:00:00Z`)
      const sovereign = type !== "Corporate"
      // Prices are per ₹100 of face value, except a gold bond's, which is per gram.
      const price = b.clean_price == null ? null : type === "SGB" ? b.clean_price : (b.clean_price / b.face_value) * 100
      return [
        {
          id: String(b.id),
          isin: b.isin ?? "",
          name: b.name,
          issuer: b.issuer,
          type,
          coupon: b.coupon_rate_pct,
          maturity,
          rating: sovereign ? "SOV" : (b.rating ?? "Unrated"),
          agency: sovereign ? "–" : (b.agency ?? "–"),
          price,
          ytm: b.ytm_pct,
          frequency: b.coupon_frequency,
          secured: false,
          taxFree: false,
          yearsLeft: Math.max(0, (maturity.getTime() - now.getTime()) / YEAR),
          fresh: b.trade_date === api.asOf && (b.trades ?? 0) > 0,
          ...(type === "SGB" && { issuePrice: b.face_value }),
        },
      ]
    })
    return { bonds, curve, real: true, asOf: api.asOf }
  }
  const bonds: BondRow[] = getBonds(now).map((b) => ({
    ...b,
    id: b.isin,
    yearsLeft: Math.max(0, (b.maturity.getTime() - now.getTime()) / YEAR),
    fresh: true,
  }))
  return { bonds, curve: yieldCurve(), real: false, asOf: null }
}
