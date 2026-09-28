import { sql } from "kysely"
import { z } from "zod"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { istToday } from "../lib/dates"

/** The IPO calendar, bonds and the G-Sec curve. */
export const referenceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/ipos",
    {
      schema: {
        tags: ["ipos"],
        summary: "IPOs by status",
        querystring: z.object({ status: z.enum(["UPCOMING", "OPEN", "CLOSED", "LISTED"]).optional() }),
      },
    },
    async (req) => {
      let q = app.db
        .selectFrom("ipo.issue as x")
        .innerJoin("ref.issuer as iss", "iss.id", "x.issuer_id")
        .leftJoin("ipo.listing as l", (j) => j.onRef("l.issue_id", "=", "x.id").on("l.exchange_code", "=", "NSE"))
        .select([
          "x.id",
          "iss.name",
          "iss.description",
          "x.board",
          "x.status",
          "x.price_band_low",
          "x.price_band_high",
          "x.lot_size",
          "x.total_issue_inr",
          "x.fresh_issue_inr",
          "x.ofs_inr",
          "x.open_date",
          "x.close_date",
          "x.allotment_date",
          "x.listing_date",
          "x.registrar",
          "x.lead_managers",
          "l.open_price as listing_price",
          "l.close_price as last_price",
          sql<Record<string, number>>`(
            SELECT coalesce(jsonb_object_agg(category, times), '{}'::jsonb) FROM (
              SELECT DISTINCT ON (category) category, times FROM ipo.subscription
              WHERE issue_id = x.id ORDER BY category, captured_at DESC) s)`.as("subscription"),
        ])
        .orderBy("x.open_date", "desc")
      if (req.query.status) q = q.where("x.status", "=", req.query.status)
      return { items: await q.execute() }
    },
  )

  app.get("/bonds", { schema: { tags: ["bonds"], summary: "Government and corporate bonds with the latest valuation" } }, async () => {
    const rows = await app.db
      .selectFrom("fi.bond as b")
      .innerJoin("ref.security as s", "s.id", "b.security_id")
      .innerJoin("ref.issuer as iss", "iss.id", "s.issuer_id")
      .leftJoin(
        (eb) =>
          eb
            .selectFrom("fi.price_daily")
            .select(["security_id", "clean_price", "ytm_pct", "trade_date", "trades"])
            .distinctOn("security_id")
            .orderBy("security_id")
            .orderBy("trade_date", "desc")
            .as("p"),
        (j) => j.onRef("p.security_id", "=", "b.security_id"),
      )
      .leftJoin(
        (eb) =>
          eb.selectFrom("corp.credit_rating").select(["security_id", "rating", "agency"]).distinctOn("security_id").orderBy("security_id").orderBy("rated_on", "desc").as("r"),
        (j) => j.onRef("r.security_id", "=", "b.security_id"),
      )
      .select([
        "s.id",
        "s.isin",
        "s.name",
        "s.security_type",
        "iss.name as issuer",
        "b.coupon_rate_pct",
        "b.maturity_date",
        "b.coupon_frequency",
        "b.face_value",
        "p.clean_price",
        "p.ytm_pct",
        "p.trade_date",
        "p.trades",
        "r.rating",
        "r.agency",
      ])
      .orderBy("b.maturity_date")
      .execute()
    return { asOf: istToday(), items: rows }
  })

  app.get("/yield-curve", { schema: { tags: ["bonds"], summary: "G-Sec par yield curve: latest, a month ago and a year ago" } }, async () => {
    const rows = await app.db
      .selectFrom("fi.yield_curve_point")
      .select(["as_of", "tenor_years", "yield_pct"])
      .where("curve", "=", "GSEC_PAR")
      .orderBy("as_of", "desc")
      .orderBy("tenor_years")
      .execute()
    const dates = [...new Set(rows.map((r) => r.as_of))].sort().reverse()
    return { curves: dates.map((d) => ({ asOf: d, points: rows.filter((r) => r.as_of === d).map((r) => ({ tenor: r.tenor_years, yield: r.yield_pct })) })) }
  })
}
