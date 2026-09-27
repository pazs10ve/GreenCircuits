import { sql } from "kysely"
import { z } from "zod"
import { KEYS, type Source } from "@greencircuits/contracts"
import type { Quote } from "@greencircuits/market/types"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"

/**
 * Latest quotes. The ingestor keeps them in a Valkey hash; if it isn't
 * running, the last daily close stands in, marked as end-of-day data.
 */
export const quoteRoutes: FastifyPluginAsyncZod = async (app) => {
  const endOfDay = async (ids: number[] | null): Promise<Quote[]> => {
    const rows = await sql<{ instrument_id: number; open: number; high: number; low: number; close: number; prev_close: number | null; volume: number; trade_date: string }>`
      SELECT DISTINCT ON (instrument_id) instrument_id, open, high, low, close, prev_close, volume, trade_date
      FROM md.candle_1d
      WHERE trade_date > current_date - 14 ${ids ? sql`AND instrument_id = ANY(${ids})` : sql``}
      ORDER BY instrument_id, trade_date DESC`.execute(app.db)
    return rows.rows.map((r) => {
      const prev = r.prev_close ?? r.close
      return {
        id: r.instrument_id,
        ltp: r.close,
        open: r.open,
        high: r.high,
        low: r.low,
        prevClose: prev,
        change: r.close - prev,
        changePct: prev ? ((r.close - prev) / prev) * 100 : 0,
        volume: Number(r.volume),
        bid: r.close,
        ask: r.close,
        ts: Date.parse(`${r.trade_date}T10:00:00Z`),
        tickDir: 0,
      }
    })
  }

  const live = async (ids: number[] | null): Promise<Quote[]> => {
    try {
      if (ids) {
        const values = await app.valkey.hmget(KEYS.quotes, ...ids.map(String))
        return values.filter((v): v is string => v != null).map((v) => JSON.parse(v) as Quote)
      }
      const all = await app.valkey.hvals(KEYS.quotes)
      return all.map((v) => JSON.parse(v) as Quote)
    } catch {
      return []
    }
  }

  const respond = async (ids: number[] | null) => {
    const quotes = await live(ids)
    const source: Source = quotes.length ? "SIMULATED" : "EOD"
    return { source, quotes: quotes.length ? quotes : await endOfDay(ids) }
  }

  app.get(
    "/quotes",
    {
      schema: {
        tags: ["quotes"],
        summary: "Latest quotes for up to 200 instruments",
        querystring: z.object({
          ids: z
            .string()
            .regex(/^\d+(,\d+)*$/)
            .transform((s) => [...new Set(s.split(",").map(Number))])
            .refine((ids) => ids.length <= 200, "At most 200 ids"),
        }),
      },
    },
    async (req, reply) => {
      reply.header("cache-control", "no-store")
      return respond(req.query.ids)
    },
  )

  // Everything at once: the web app hydrates its quote store from this on first render.
  app.get("/quotes/snapshot", { schema: { tags: ["quotes"], summary: "Latest quote for every instrument" } }, async (_req, reply) => {
    reply.header("cache-control", "no-store")
    return respond(null)
  })
}
