import { sql } from "kysely"
import { z } from "zod"
import type { Db } from "@greencircuits/db"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import { expiriesFor } from "@greencircuits/market/chain"
import { balancedMix, oversoldDips, sipVsDip } from "@greencircuits/market/research/experiments"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { cached } from "../lib/cache"
import { lastDailyCandles } from "../lib/candles"
import { addDays, istToday, weekdayOf } from "../lib/dates"

export interface MarketEventDto {
  date: string
  kind: "RESULTS" | "EXPIRY" | "IPO" | "DIVIDEND"
  title: string
  detail: string
  instrumentId?: number
}

/** What's ahead: results and record dates, IPO openings and closings, and weekly index expiries. */
export async function comingUp(db: Db, today = istToday(), days = 30): Promise<MarketEventDto[]> {
  const until = addDays(today, days)
  const [corp, ipos] = await Promise.all([
    db
      .selectFrom("corp.event as e")
      .innerJoin("ref.security as s", "s.issuer_id", "e.issuer_id")
      .innerJoin("ref.instrument as i", (join) => join.onRef("i.security_id", "=", "s.id").on("i.kind", "=", "LISTING"))
      .select(["i.id", "i.trading_symbol", "e.event_type", "e.event_date", "e.purpose"])
      .where("e.event_date", ">=", today)
      .where("e.event_date", "<=", until)
      .execute(),
    db
      .selectFrom("ipo.issue as x")
      .innerJoin("ref.issuer as iss", "iss.id", "x.issuer_id")
      .select(["iss.name", "x.status", "x.open_date", "x.close_date", "x.price_band_low", "x.price_band_high", "x.lot_size"])
      .where("x.status", "in", ["UPCOMING", "OPEN"])
      .execute(),
  ])
  const events: MarketEventDto[] = [
    ...corp.map((e) => ({
      date: e.event_date,
      kind: e.event_type === "RESULTS" ? ("RESULTS" as const) : ("DIVIDEND" as const),
      title: `${e.trading_symbol} ${e.event_type === "RESULTS" ? "results" : "ex-dividend"}`,
      detail: e.purpose ?? "",
      instrumentId: e.id,
    })),
    ...ipos.map((x) => ({
      date: (x.status === "OPEN" ? x.close_date : x.open_date) ?? today,
      kind: "IPO" as const,
      title: `${x.name} IPO ${x.status === "OPEN" ? "closes" : "opens"}`,
      // NSE's lists sometimes lack the band, and never give the lot size; say only what's known.
      detail: [x.price_band_low != null && x.price_band_high != null ? `₹${x.price_band_low}–${x.price_band_high}` : null, x.lot_size != null ? `lot ${x.lot_size}` : null]
        .filter(Boolean)
        .join(" · "),
    })),
  ]
  const now = new Date()
  for (const [id, label, venue] of [
    [INDEX.NIFTY, "NIFTY weekly expiry", "NSE index options, 15:30 IST"],
    [INDEX.SENSEX, "SENSEX weekly expiry", "BSE index options, 15:30 IST"],
  ] as const) {
    const expiry = expiriesFor(getInstrument(id)!, now, 1)[0]
    if (expiry) events.push({ date: expiry.toISOString().slice(0, 10), kind: "EXPIRY", title: label, detail: venue })
  }
  return events.filter((e) => e.date >= today && e.date <= until).sort((a, b) => a.date.localeCompare(b.date))
}

export const marketRoutes: FastifyPluginAsyncZod = async (app) => {
  // Everything the Today page needs besides live quotes.
  app.get("/market/today", { schema: { tags: ["market"], summary: "Context for the daily brief" } }, async (_req, reply) => {
    const today = istToday()
    reply.header("cache-control", "public, max-age=60")
    return cached(app.valkey, `gc:today:${today}`, 300, async () => {
      const [ranges, results, events, niftyCandles] = await Promise.all([
        sql<{ instrument_id: number; high: number; low: number }>`
          SELECT instrument_id, max(high) AS high, min(low) AS low FROM (
            SELECT c.instrument_id, c.high, c.low,
                   row_number() OVER (PARTITION BY c.instrument_id ORDER BY c.trade_date DESC) AS rn
            FROM md.candle_1d c JOIN ref.instrument i ON i.id = c.instrument_id AND i.kind = 'LISTING'
            WHERE c.trade_date > ${addDays(today, -400)}::date
          ) t WHERE rn <= 250 GROUP BY instrument_id`.execute(app.db),
        app.db
          .selectFrom("corp.event as e")
          .innerJoin("ref.security as s", "s.issuer_id", "e.issuer_id")
          .innerJoin("ref.instrument as i", (join) => join.onRef("i.security_id", "=", "s.id").on("i.kind", "=", "LISTING"))
          .select(["i.id", "e.event_date"])
          .where("e.event_type", "=", "RESULTS")
          .where("e.event_date", ">=", today)
          .where("e.event_date", "<=", addDays(today, 8))
          .execute(),
        comingUp(app.db, today),
        lastDailyCandles(app.db, INDEX.NIFTY, 2520),
      ])
      const nifty = getInstrument(INDEX.NIFTY)!
      return {
        ranges: ranges.rows.map((r) => [r.instrument_id, r.high, r.low] as [number, number, number]),
        results: results.map((r) => [r.id, weekdayOf(r.event_date)] as [number, string]),
        events: events.slice(0, 6),
        experiments: niftyCandles.length > 500
          ? [sipVsDip(nifty, { candles: niftyCandles }), balancedMix(nifty, { candles: niftyCandles }), oversoldDips(nifty, { candles: niftyCandles })]
          : [],
      }
    })
  })

  app.get(
    "/market/flows",
    {
      schema: {
        tags: ["market"],
        summary: "FPI and DII net cash-market flows, ₹ crore",
        querystring: z.object({ days: z.coerce.number().int().min(1).max(60).default(15) }),
      },
    },
    async (req) => {
      const rows = await app.db
        .selectFrom("md.institutional_flow")
        .select(["trade_date", "participant", "net_value"])
        .where("segment", "=", "CASH")
        .orderBy("trade_date", "desc")
        .limit(req.query.days * 2)
        .execute()
      const byDay = new Map<string, { date: string; fpiCash: number; diiCash: number }>()
      for (const r of rows) {
        const d = byDay.get(r.trade_date) ?? { date: r.trade_date, fpiCash: 0, diiCash: 0 }
        if (r.participant === "FPI") d.fpiCash = r.net_value ?? 0
        else d.diiCash = r.net_value ?? 0
        byDay.set(r.trade_date, d)
      }
      return { days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)) }
    },
  )
}
