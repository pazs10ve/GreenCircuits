import { sql } from "kysely"
import { z } from "zod"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { lastDailyCandles } from "../lib/candles"

const KIND = { LISTING: "EQUITY", INDEX: "INDEX", SPOT: "SPOT", FUTURE: "FUTURE", OPTION: "OPTION" } as const

export const instrumentSummary = (r: {
  id: number
  trading_symbol: string
  display_name: string
  kind: keyof typeof KIND
  segment: string
  exchange_code: string
  tick_size: number
  lot_size: number
  attrs: unknown
}) => {
  const attrs = (r.attrs ?? {}) as Record<string, unknown>
  const kind = r.kind === "SPOT" ? (r.segment === "CURRENCY_DERIV" ? "CURRENCY" : "COMMODITY") : KIND[r.kind]
  return {
    id: r.id,
    symbol: r.trading_symbol,
    name: r.display_name,
    slug: (attrs.slug as string) ?? r.trading_symbol.toLowerCase(),
    kind,
    exchange: r.exchange_code,
    tick: r.tick_size,
    lot: (attrs.lot as number | null) ?? r.lot_size,
    sector: (attrs.sector as string | null) ?? null,
    industry: (attrs.industry as string | null) ?? null,
  }
}

const SUMMARY_COLUMNS = ["id", "trading_symbol", "display_name", "kind", "segment", "exchange_code", "tick_size", "lot_size", "attrs"] as const

export const instrumentRoutes: FastifyPluginAsyncZod = async (app) => {
  // Typeahead: prefix matches on the symbol first, then fuzzy name matches, then liquidity.
  app.get(
    "/instruments",
    {
      schema: {
        tags: ["instruments"],
        summary: "Search instruments by symbol or name",
        querystring: z.object({ q: z.string().trim().max(60).optional(), limit: z.coerce.number().int().min(1).max(50).default(10) }),
      },
    },
    async (req) => {
      const { q, limit } = req.query
      let query = app.db.selectFrom("ref.instrument").select(SUMMARY_COLUMNS).where("status", "=", "ACTIVE").where("kind", "<>", "OPTION")
      if (q) {
        const prefix = `${q.replace(/[%_\\]/g, "\\$&")}%`
        query = query
          .where((eb) =>
            eb.or([
              eb("trading_symbol", "ilike", prefix),
              eb("display_name", "ilike", `%${q.replace(/[%_\\]/g, "\\$&")}%`),
              eb(sql<number>`similarity(display_name, ${q})`, ">", 0.25),
            ]),
          )
          .orderBy(sql`trading_symbol ilike ${prefix}`, "desc")
          .orderBy(sql`similarity(display_name, ${q})`, "desc")
      }
      const rows = await query.orderBy("search_rank", "desc").limit(limit).execute()
      return { items: rows.map(instrumentSummary) }
    },
  )

  app.get(
    "/instruments/:slug",
    {
      schema: {
        tags: ["instruments"],
        summary: "One instrument by its page slug",
        params: z.object({ slug: z.string().regex(/^[a-z0-9-]{1,40}$/) }),
      },
    },
    async (req, reply) => {
      const row = await app.db
        .selectFrom("ref.instrument")
        .select(SUMMARY_COLUMNS)
        .where(sql<string>`attrs->>'slug'`, "=", req.params.slug)
        .where("status", "=", "ACTIVE")
        .executeTakeFirst()
      if (!row) return reply.code(404).send({ error: "not_found" })
      return instrumentSummary(row)
    },
  )

  // Daily bars (split-adjusted through md.daily_candles once corporate actions exist).
  app.get(
    "/instruments/:id/candles",
    {
      schema: {
        tags: ["instruments"],
        summary: "Daily bars, oldest first",
        params: z.object({ id: z.coerce.number().int().positive() }),
        querystring: z.object({ sessions: z.coerce.number().int().min(2).max(2600).default(250) }),
      },
    },
    async (req, reply) => {
      reply.header("cache-control", "public, max-age=60")
      return { candles: await lastDailyCandles(app.db, req.params.id, req.query.sessions) }
    },
  )

  // The latest session's intraday bars (the last 6¼ hours: the demo market trades around the clock),
  // from the 1-minute table the ingestor writes, rolled up on read.
  app.get(
    "/instruments/:id/intraday",
    {
      schema: {
        tags: ["instruments"],
        summary: "Today's intraday bars (IST session)",
        params: z.object({ id: z.coerce.number().int().positive() }),
        querystring: z.object({ minutes: z.coerce.number().int().refine((m) => [1, 5, 15].includes(m)).default(5) }),
      },
    },
    async (req) => {
      const bucket = `${req.query.minutes} minutes`
      const rows = await sql<{ t: number; open: number; high: number; low: number; close: number; volume: number }>`
        SELECT extract(epoch FROM time_bucket(${bucket}::interval, ts))::bigint AS t,
               first(open, ts) AS open, max(high) AS high, min(low) AS low,
               last(close, ts) AS close, sum(volume)::bigint AS volume
        FROM md.candle_1m
        WHERE instrument_id = ${req.params.id} AND ts >= now() - interval '376 minutes'
        GROUP BY 1 ORDER BY 1`.execute(app.db)
      return {
        candles: rows.rows.map((r) => ({ time: Number(r.t), open: r.open, high: r.high, low: r.low, close: r.close, volume: Number(r.volume) })),
      }
    },
  )
}
