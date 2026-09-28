import { sql } from "kysely"
import { z } from "zod"
import { INDEX, getInstrument, sizeBand } from "@greencircuits/market/catalog"
import type { ScreenRow } from "@greencircuits/market/fundamentals"
import { balancedMix, sipVsDip } from "@greencircuits/market/research/experiments"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { cached } from "../lib/cache"
import { lastDailyCandles } from "../lib/candles"
import { istToday } from "../lib/dates"

/** Fewer members than this in the site's universe, and an index's "what's moving it" would mislead. */
export const MIN_MEMBERS = 5

/** The newest bar per instrument sits in md.candle_1d; these read the last year of them. */
const lastYear = sql`
  SELECT instrument_id, trade_date, high, low, close,
         row_number() OVER (PARTITION BY instrument_id ORDER BY trade_date DESC) AS rn
  FROM md.candle_1d
  WHERE trade_date > current_date - 400`

export const universeRoutes: FastifyPluginAsyncZod = async (app) => {
  // What the list pages draw beside live prices: a month of closes, the 52-week range, how far back prices
  // go, beta, EPS and index members.
  app.get(
    "/market/universe",
    { schema: { tags: ["market"], summary: "Sparklines, 52-week ranges, history start, beta, EPS and index members for every instrument" } },
    async (_req, reply) => {
      reply.header("cache-control", "public, max-age=60")
      return cached(app.valkey, `gc:universe:${istToday()}`, 300, async () => {
        const [ranges, starts, betas, eps, members] = await Promise.all([
          sql<{ instrument_id: number; high52: number; low52: number; sessions: number; spark: number[]; year_ago: number | null }>`
            SELECT instrument_id, max(high) AS high52, min(low) AS low52, count(*)::int AS sessions,
                   array_agg(close ORDER BY trade_date) FILTER (WHERE rn <= 30) AS spark,
                   max(close) FILTER (WHERE rn = 250) AS year_ago
            FROM (${lastYear}) t WHERE rn <= 250 GROUP BY instrument_id`.execute(app.db),
          sql<{ instrument_id: number; since: string }>`
            SELECT instrument_id, min(trade_date)::text AS since FROM md.candle_1d GROUP BY instrument_id`.execute(app.db),
          app.db.selectFrom("ref.instrument").select(["id", sql<number | null>`(attrs->>'beta')::float8`.as("beta")]).execute(),
          app.db.selectFrom("scr.equity_snapshot").select(["instrument_id", "eps_ttm"]).execute(),
          app.db.selectFrom("ref.index_constituent").select(["index_id", "member_id"]).where(sql<boolean>`upper_inf(valid_during)`).orderBy("member_id").execute(),
        ])
        const since = new Map(starts.rows.map((r) => [r.instrument_id, r.since]))
        const beta = new Map(betas.map((b) => [b.id, b.beta]))
        const byIndex: Record<number, number[]> = {}
        for (const m of members) (byIndex[m.index_id] ??= []).push(m.member_id)
        return {
          instruments: ranges.rows.map((r) => ({
            id: r.instrument_id,
            spark: r.spark,
            high52: r.high52,
            low52: r.low52,
            sessions: r.sessions,
            since: since.get(r.instrument_id)!,
            beta: beta.get(r.instrument_id) ?? null,
            yearAgo: r.year_ago,
          })),
          eps: Object.fromEntries(eps.filter((e) => e.eps_ttm != null).map((e) => [e.instrument_id, e.eps_ttm!])),
          members: byIndex,
        }
      })
    },
  )

  // The screener's rows: one per stock from scr.equity_snapshot, which the nightly loaders fill.
  app.get("/screener/rows", { schema: { tags: ["screener"], summary: "One row of fundamentals and technicals per stock" } }, async (_req, reply) => {
    reply.header("cache-control", "public, max-age=60")
    return cached(app.valkey, `gc:screener:${istToday()}`, 300, async () => {
      const rows = await app.db.selectFrom("scr.equity_snapshot").selectAll().orderBy("mcap_cr", "desc").execute()
      const out: ScreenRow[] = []
      for (const r of rows) {
        const inst = getInstrument(r.instrument_id)
        if (!inst?.sector) continue
        // Postgres sends bigint arrays as strings. The database's membership is the latest the loaders saw.
        const indexIds = r.index_ids?.length ? r.index_ids.map(Number) : inst.indices
        out.push({
          id: r.instrument_id,
          symbol: inst.symbol,
          name: inst.name,
          sector: inst.sector,
          size: sizeBand(indexIds),
          mcapCr: r.mcap_cr,
          pe: r.pe_ttm,
          pb: r.pb,
          roe: r.roe_pct,
          roce: r.roce_pct,
          opm: r.opm_pct,
          // Debt to equity means little for a lender, whose borrowings are its stock in trade.
          debtEquity: inst.sector === "Financials" ? null : r.debt_to_equity,
          divYield: r.div_yield_pct,
          salesCagr3y: r.sales_cagr_3y_pct,
          profitCagr3y: r.profit_cagr_3y_pct,
          promoter: r.promoter_pct,
          pledged: r.promoter_pledge_pct,
          rsi14: r.rsi_14,
          sma50: r.sma_50,
          sma200: r.sma_200,
          return1m: r.return_1m_pct,
          return1y: r.return_1y_pct,
          high52: r.high_52w,
          low52: r.low_52w,
          fromHigh52: r.from_52w_high_pct,
        })
      }
      return { rows: out }
    })
  })

  // An index, currency or commodity page: where the price sits in its year, members, and the experiments.
  app.get(
    "/market/overview/:slug",
    {
      schema: {
        tags: ["market"],
        summary: "An index, currency or commodity: its year's range, members and experiments",
        params: z.object({ slug: z.string().regex(/^[a-z0-9-]{1,40}$/) }),
      },
    },
    async (req, reply) => {
      const data = await cached(app.valkey, `gc:overview:${req.params.slug}:${istToday()}`, 300, async () => {
        const row = await app.db
          .selectFrom("ref.instrument")
          .select(["id", "kind"])
          .where(sql<string>`attrs->>'slug'`, "=", req.params.slug)
          .where("kind", "<>", "LISTING")
          .executeTakeFirst()
        const inst = row && getInstrument(row.id)
        if (!row || !inst) return null
        const [candles, members] = await Promise.all([
          lastDailyCandles(app.db, row.id, 2520),
          app.db.selectFrom("ref.index_constituent").select("member_id").where("index_id", "=", row.id).where(sql<boolean>`upper_inf(valid_during)`).orderBy("member_id").execute(),
        ])
        if (candles.length === 0) return null
        const year = candles.slice(-250)
        const ids = members.map((m) => m.member_id)
        // Investing in an index needs years of it to test; the VIX is a gauge, not something to buy.
        const experiments = row.kind === "INDEX" && row.id !== INDEX.VIX && candles.length > 500
          ? [sipVsDip(inst, { years: 10, candles }), balancedMix(inst, { candles })]
          : []
        return {
          id: row.id,
          close: candles.at(-1)!.close,
          high52: Math.max(...year.map((c) => c.high)),
          low52: Math.min(...year.map((c) => c.low)),
          /** Sessions in the 52-week range: a few indices only have days since the real data was first loaded. */
          sessions: year.length,
          since: new Date(candles[0]!.time * 1000).toISOString().slice(0, 10),
          members: ids,
          experiments,
        }
      })
      if (!data) return reply.code(404).send({ error: "not_found" })
      reply.header("cache-control", "public, max-age=60")
      return data
    },
  )
}
