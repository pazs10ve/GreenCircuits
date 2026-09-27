import { sql } from "kysely"
import { getIpos, totalSubscription } from "@greencircuits/market/reference"
import type { Db } from "../index"
import { insertMany, istDate, upsertFixedIds } from "./util"

/** The IPO calendar: fictional issuers, real mechanics (SEBI categories, T+3 listing). */

const ISSUER_BASE = 3000

export async function seedIpos(db: Db): Promise<Record<string, number>> {
  const now = new Date()
  const ipos = getIpos(now)

  // Issues the real-data loader added (docs/adr/0007) would outlive a reseed under these issuers'
  // fictional names; the demo calendar replaces them, and alerts on them go too.
  const keep = ipos.map((_, i) => i + 1)
  await db.deleteFrom("app.alert").where("ipo_issue_id", "not in", keep).execute()
  await db.deleteFrom("ipo.listing").where("issue_id", "not in", keep).execute()
  await db.deleteFrom("ipo.issue").where("id", "not in", keep).execute()

  await upsertFixedIds(db, "ref.issuer", ipos.map((ipo, i) => ({ id: ISSUER_BASE + i, name: ipo.name, issuer_type: "COMPANY", fs_format: "GENERAL", description: ipo.about })))

  const rows = ipos.map((ipo, i) => ({
    id: i + 1,
    issuer_id: ISSUER_BASE + i,
    board: ipo.board,
    issue_kind: "IPO",
    pricing: ipo.board === "SME" ? "FIXED_PRICE" : "BOOK_BUILT",
    exchanges: ipo.board === "SME" ? ["NSE"] : ["NSE", "BSE"],
    status: ipo.status,
    price_band_low: ipo.board === "SME" ? ipo.priceHigh : ipo.priceLow,
    price_band_high: ipo.priceHigh,
    final_price: ipo.status === "LISTED" || ipo.status === "CLOSED" ? ipo.priceHigh : null,
    face_value: 10,
    lot_size: ipo.lot,
    fresh_issue_inr: ipo.freshCr * 1e7,
    ofs_inr: ipo.ofsCr * 1e7,
    total_issue_inr: ipo.issueSizeCr * 1e7,
    open_date: istDate(ipo.open),
    close_date: istDate(ipo.close),
    allotment_date: istDate(ipo.allotment),
    refund_date: istDate(new Date(ipo.allotment.getTime() + 86400000)),
    demat_credit_date: istDate(new Date(ipo.allotment.getTime() + 86400000)),
    listing_date: istDate(ipo.listing),
    registrar: ipo.registrar,
    lead_managers: ipo.leadManagers,
  }))
  await upsertFixedIds(db, "ipo.issue", rows)
  await sql`SELECT setval(pg_get_serial_sequence('ipo.issue', 'id'), GREATEST((SELECT max(id) FROM ipo.issue), 1000))`.execute(db)

  const ids = rows.map((r) => r.id)
  await db.deleteFrom("ipo.reservation").where("issue_id", "in", ids).execute()
  await db.deleteFrom("ipo.subscription").where("issue_id", "in", ids).execute()
  await db.deleteFrom("ipo.listing").where("issue_id", "in", ids).execute()

  const share: Record<string, number> = { QIB: 50, NII: 15, RETAIL: 35, EMPLOYEE: 0 }
  await insertMany(
    db,
    "ipo.reservation",
    ipos.flatMap((ipo, i) =>
      ipo.subscription.map((c) => ({ issue_id: i + 1, category: c.code, pct_of_issue: ipo.board === "SME" ? 50 : share[c.code] ?? 0 })),
    ),
  )
  await insertMany(
    db,
    "ipo.subscription",
    ipos
      .map((ipo, i) => ({ ipo, i }))
      .filter(({ ipo }) => ipo.status !== "UPCOMING")
      .flatMap(({ ipo, i }) => [
        ...ipo.subscription.map((c) => ({ issue_id: i + 1, category: c.code, captured_at: now, times: c.times })),
        { issue_id: i + 1, category: "TOTAL", captured_at: now, times: Math.round(totalSubscription(ipo) * 100) / 100 },
      ]),
  )
  await insertMany(
    db,
    "ipo.listing",
    ipos
      .map((ipo, i) => ({ ipo, i }))
      .filter(({ ipo }) => ipo.status === "LISTED" && ipo.listingPrice != null)
      .map(({ ipo, i }) => ({
        issue_id: i + 1,
        exchange_code: "NSE",
        listing_date: istDate(ipo.listing),
        open_price: ipo.listingPrice!,
        close_price: ipo.lastPrice ?? ipo.listingPrice!,
      })),
  )
  return { issues: rows.length }
}
