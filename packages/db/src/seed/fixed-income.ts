import { EQUITIES } from "@greencircuits/market/catalog"
import { getBonds, yieldCurve, type BondType } from "@greencircuits/market/reference"
import type { Db } from "../index"
import { ISSUER_ID_OFFSET } from "./reference"
import { insertMany, istDate, upsertFixedIds } from "./util"

/** Bonds, their ratings and prices, and the G-Sec par curve. Sample terms on real issuer names. */

const ISSUER_BASE = 2000
const SECURITY_BASE = 2100

const SECURITY_TYPE: Record<BondType, "GSEC" | "SDL" | "TBILL" | "SGB" | "CORPORATE_BOND"> = {
  "G-Sec": "GSEC",
  SDL: "SDL",
  "T-Bill": "TBILL",
  SGB: "SGB",
  PSU: "CORPORATE_BOND",
  Corporate: "CORPORATE_BOND",
}

export async function seedFixedIncome(db: Db): Promise<Record<string, number>> {
  const now = new Date()
  const bonds = getBonds(now)
  const equityIssuer = new Map(EQUITIES.map((e) => [e.name, ISSUER_ID_OFFSET + e.id]))

  // One issuer per name; companies that are also listed reuse their equity issuer.
  const names = [...new Set(bonds.map((b) => b.issuer))]
  const issuerId = new Map<string, number>()
  const newIssuers: Record<string, unknown>[] = []
  names.forEach((name, i) => {
    const existing = equityIssuer.get(name)
    if (existing) return void issuerId.set(name, existing)
    const bond = bonds.find((b) => b.issuer === name)!
    const type =
      bond.type === "SDL" ? "STATE_GOVT" : bond.type === "PSU" ? "PSU" : bond.type === "Corporate" ? "NBFC" : "CENTRAL_GOVT"
    issuerId.set(name, ISSUER_BASE + i)
    newIssuers.push({ id: ISSUER_BASE + i, name, issuer_type: type, fs_format: "GENERAL" })
  })
  await upsertFixedIds(db, "ref.issuer", newIssuers)

  const securityIds = bonds.map((_, i) => SECURITY_BASE + i)
  await db.deleteFrom("fi.price_daily").where("security_id", "in", securityIds).execute()
  await db.deleteFrom("corp.credit_rating").where("security_id", "in", securityIds).execute()
  await db.deleteFrom("fi.bond").where("security_id", "in", securityIds).execute()
  await upsertFixedIds(
    db,
    "ref.security",
    bonds.map((b, i) => ({
        id: SECURITY_BASE + i,
        issuer_id: issuerId.get(b.issuer)!,
        security_type: SECURITY_TYPE[b.type],
        isin: b.isin,
        name: b.name,
        face_value: 100,
      })),
  )

  await insertMany(
    db,
    "fi.bond",
    bonds.map((b, i) => {
      const maturity = istDate(b.maturity)
      const tenor = b.type === "T-Bill" ? (b.name.startsWith("182") ? 0.5 : 1) : b.type === "SGB" ? 8 : 10
      const issued = new Date(b.maturity.getTime() - tenor * 365.25 * 86400000)
      return {
        security_id: SECURITY_BASE + i,
        issue_date: istDate(issued),
        maturity_date: maturity,
        face_value: 100,
        coupon_type: b.coupon == null ? "ZERO" : "FIXED",
        coupon_rate_pct: b.coupon,
        coupon_frequency: b.coupon == null ? 0 : 2,
        day_count: b.type === "T-Bill" ? "ACT/364" : b.type === "PSU" || b.type === "Corporate" ? "ACT/365" : "30/360",
        seniority: "SENIOR",
        is_secured: b.secured,
        is_tax_free: b.taxFree,
        min_investment_inr: b.type === "SGB" ? 11000 : b.type === "Corporate" || b.type === "PSU" ? 10000 : 10000,
      }
    }),
  )

  const today = istDate(now)
  await insertMany(
    db,
    "fi.price_daily",
    bonds.map((b, i) => ({ security_id: SECURITY_BASE + i, trade_date: today, venue: "VALUATION", clean_price: b.price, ytm_pct: b.ytm })),
  )
  await insertMany(
    db,
    "corp.credit_rating",
    bonds
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.rating !== "SOV")
      .map(({ b, i }) => ({
        issuer_id: issuerId.get(b.issuer)!,
        security_id: SECURITY_BASE + i,
        agency: b.agency,
        scale: "LONG_TERM",
        rating: b.rating,
        outlook: "STABLE",
        action: "REAFFIRMED",
        rated_on: istDate(new Date(now.getTime() - (40 + i * 11) * 86400000)),
      })),
  )

  // G-Sec par curve today, a month ago and a year ago.
  const curve = yieldCurve()
  const asOf = [
    { date: today, key: "today" as const },
    { date: istDate(new Date(now.getTime() - 30 * 86400000)), key: "monthAgo" as const },
    { date: istDate(new Date(now.getTime() - 365 * 86400000)), key: "yearAgo" as const },
  ]
  await db.deleteFrom("fi.yield_curve_point").where("curve", "=", "GSEC_PAR").where("as_of", "in", asOf.map((a) => a.date)).execute()
  const points = asOf.flatMap((a) => curve.map((p) => ({ curve: "GSEC_PAR", as_of: a.date, tenor_years: p.tenor, yield_pct: Math.round(p[a.key] * 1e6) / 1e6 })))
  await insertMany(db, "fi.yield_curve_point", points)

  return { bonds: bonds.length, issuers: newIssuers.length, curvePoints: points.length }
}
