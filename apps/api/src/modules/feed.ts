import { sql } from "kysely"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { KEYS, readSession } from "@greencircuits/contracts"
import type { RunMetrics } from "@greencircuits/contracts/lab"
import type { StrategyDefinition } from "@greencircuits/contracts/strategy"
import { buildFeed, interestsOf, type FeedAlert, type FeedTest } from "@greencircuits/feed/feed"
import { entrySignals, type SavedRules } from "@greencircuits/feed/signals"
import { EQUITIES, INDEX } from "@greencircuits/market/catalog"
import { istDate, isTrading, sessionWhen } from "@greencircuits/market/session"
import type { Candle, Quote } from "@greencircuits/market/types"
import { addDays, dateToUnix, istToday } from "../lib/dates"
import { userIdOf } from "../lib/session"
import { publicUser } from "../lib/users"
import { comingUp } from "./market"

/**
 * GET /me/feed: the personalised feed (packages/feed), built from what the
 * visitor follows (holdings, alerts, watchlists, the stocks in their tests)
 * with live quotes from Valkey and history from TimescaleDB.
 */

const KIND_TO_CONDITION = {
  PRICE_ABOVE: "PRICE_ABOVE",
  PRICE_BELOW: "PRICE_BELOW",
  CHANGE_PCT_ABOVE: "CHANGE_ABOVE",
  CHANGE_PCT_BELOW: "CHANGE_BELOW",
} as const satisfies Record<string, FeedAlert["condition"]>
type AlertKind = keyof typeof KIND_TO_CONDITION
/** A test's stocks count as followed only when it's about a few of them, not a whole index. */
const MAX_TEST_UNIVERSE = 10
const MAX_SAVED_RULES = 5
const DAY = 86_400_000

const idsOf = (d: StrategyDefinition) => (d.type === "rules" ? d.universe : [d.instrumentId])

export const feedRoutes: FastifyPluginAsyncZod = async (app) => {
  const db = app.db

  /** Live quotes, with the last daily close standing in for anything the feed hasn't published. */
  async function quotesFor(ids: number[]): Promise<Map<number, Quote>> {
    const out = new Map<number, Quote>()
    if (!ids.length) return out
    const live = await app.valkey.hmget(KEYS.quotes, ...ids.map(String)).catch(() => [])
    for (const v of live) if (v) out.set((JSON.parse(v) as Quote).id, JSON.parse(v) as Quote)
    const missing = ids.filter((id) => !out.has(id))
    if (missing.length) {
      const rows = await sql<{ instrument_id: number; trade_date: string; open: number; high: number; low: number; close: number; prev_close: number | null; volume: number }>`
        SELECT DISTINCT ON (instrument_id) instrument_id, trade_date, open, high, low, close, prev_close, volume
        FROM md.candle_1d WHERE instrument_id = ANY(${missing}) AND trade_date > current_date - 14
        ORDER BY instrument_id, trade_date DESC`.execute(db)
      for (const r of rows.rows) {
        const prev = r.prev_close ?? r.close
        out.set(r.instrument_id, { id: r.instrument_id, ltp: r.close, open: r.open, high: r.high, low: r.low, prevClose: prev, change: r.close - prev, changePct: prev ? ((r.close - prev) / prev) * 100 : 0, volume: Number(r.volume), bid: r.close, ask: r.close, ts: Date.parse(`${r.trade_date}T10:00:00Z`), tickDir: 0 })
      }
    }
    return out
  }

  app.get("/me/feed", { schema: { tags: ["me"], summary: "Your feed: what matters today about the stocks you follow" } }, async (req, reply) => {
    reply.header("cache-control", "no-store")
    const userId = await userIdOf(req, reply)
    if (!userId) return { items: [], following: 0 }
    const now = Date.now()
    const today = istToday()

    const [user, watched, holdings, alerts, runs] = await Promise.all([
      publicUser(db, userId),
      db
        .selectFrom("app.watchlist as w")
        .innerJoin("app.watchlist_item as i", "i.watchlist_id", "w.id")
        .select("i.instrument_id")
        .where("w.user_id", "=", userId)
        .execute(),
      sql<{ instrument_id: number; qty: number }>`
        SELECT t.instrument_id, sum(CASE WHEN t.txn_type = 'BUY' THEN t.quantity ELSE -t.quantity END)::float8 AS qty
        FROM app.portfolio_txn t JOIN app.portfolio p ON p.id = t.portfolio_id
        WHERE p.user_id = ${userId} AND t.txn_type IN ('BUY', 'SELL')
        GROUP BY t.instrument_id HAVING sum(CASE WHEN t.txn_type = 'BUY' THEN t.quantity ELSE -t.quantity END) > 0`.execute(db),
      db
        .selectFrom("app.alert as a")
        .select([
          "a.id",
          "a.instrument_id",
          "a.kind",
          "a.threshold",
          "a.last_triggered_at",
          sql<number | null>`(SELECT observed_value FROM app.alert_trigger t WHERE t.alert_id = a.id ORDER BY triggered_at DESC LIMIT 1)`.as("price"),
        ])
        .where("a.user_id", "=", userId)
        .where("a.kind", "in", Object.keys(KIND_TO_CONDITION) as AlertKind[])
        .execute(),
      db
        .selectFrom("lab.backtest_run as r")
        .innerJoin("lab.strategy as s", "s.id", "r.strategy_id")
        .innerJoin("lab.strategy_version as v", (j) => j.onRef("v.strategy_id", "=", "r.strategy_id").onRef("v.version", "=", "r.strategy_version"))
        .leftJoin("lab.backtest_result as res", "res.run_id", "r.id")
        .select(["r.id", "s.name", "v.definition", "r.status", "r.finished_at", "res.metrics"])
        .where("r.user_id", "=", userId)
        .where("r.queued_at", ">", new Date(now - 60 * DAY))
        .orderBy("r.queued_at", "desc")
        .limit(50)
        .execute(),
    ])

    const tests = runs.map((r) => ({ ...r, definition: r.definition as StrategyDefinition, metrics: r.metrics as RunMetrics | null }))
    const interests = interestsOf({
      holdings: holdings.rows.map((h) => h.instrument_id),
      alerts: alerts.map((a) => a.instrument_id).filter((id): id is number => id != null),
      watchlists: watched.map((w) => w.instrument_id),
      lab: tests.flatMap((t) => (idsOf(t.definition).length <= MAX_TEST_UNIVERSE ? idsOf(t.definition) : [])),
    })

    // The latest successful run of each rules strategy, for today's signals.
    const saved = new Map<string, SavedRules>()
    for (const t of tests) {
      if (t.definition.type === "rules" && t.status === "SUCCEEDED" && !saved.has(t.name) && saved.size < MAX_SAVED_RULES) {
        saved.set(t.name, { name: t.name, runId: t.id, definition: t.definition })
      }
    }
    const signalIds = [...new Set([...saved.values()].flatMap((r) => r.definition.universe))]
    const sectorIds = EQUITIES.filter((i) => i.sector && user.preferences.sectors.includes(i.sector)).map((i) => i.id)
    const quoteIds = [...new Set([...interests.keys(), ...signalIds, ...sectorIds])]

    const [quotes, ranges, events, history] = await Promise.all([
      quotesFor(quoteIds),
      interests.size
        ? sql<{ instrument_id: number; high: number; low: number }>`
            SELECT instrument_id, max(high) AS high, min(low) AS low FROM (
              SELECT instrument_id, high, low, row_number() OVER (PARTITION BY instrument_id ORDER BY trade_date DESC) AS rn
              FROM md.candle_1d WHERE instrument_id = ANY(${[...interests.keys()]}) AND trade_date > ${addDays(today, -400)}::date
            ) t WHERE rn <= 250 GROUP BY instrument_id`.execute(db)
        : { rows: [] },
      interests.size ? comingUp(db, today, 8) : [],
      signalIds.length
        ? db
            .selectFrom("md.candle_1d")
            .select(["instrument_id", "trade_date", "open", "high", "low", "close", "volume"])
            .where("instrument_id", "in", signalIds)
            .where("trade_date", ">", addDays(today, -450))
            .orderBy("trade_date")
            .execute()
        : [],
    ])

    const bars = new Map<number, Candle[]>()
    for (const r of history) {
      const list = bars.get(r.instrument_id) ?? []
      list.push({ time: dateToUnix(r.trade_date), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume })
      bars.set(r.instrument_id, list)
    }
    const range = new Map(ranges.rows.map((r) => [r.instrument_id, { high: r.high, low: r.low }]))

    // After the close the feed says when the session was ("closed up 2% on Friday").
    const [session, niftyRaw] = await Promise.all([app.valkey.get(KEYS.session).catch(() => null), app.valkey.hget(KEYS.quotes, String(INDEX.NIFTY)).catch(() => null)])
    const niftyTs = niftyRaw ? (JSON.parse(niftyRaw) as Quote).ts : undefined
    const closed = isTrading(readSession(session)?.source ?? "EOD", niftyTs, now) ? null : sessionWhen(niftyTs != null ? istDate(niftyTs) : today, today)

    const items = buildFeed({
      now,
      preferences: user.preferences,
      interests,
      quote: (id) => quotes.get(id),
      range: (id) => range.get(id),
      holdings: holdings.rows.map((h) => ({ instrumentId: h.instrument_id, qty: h.qty })),
      events,
      alerts: alerts
        .filter((a) => a.instrument_id != null && a.last_triggered_at && now - a.last_triggered_at.getTime() < DAY)
        .map((a) => ({
          id: a.id,
          instrumentId: a.instrument_id!,
          condition: KIND_TO_CONDITION[a.kind as AlertKind],
          value: a.threshold ?? 0,
          triggeredAt: a.last_triggered_at!.getTime(),
          triggeredPrice: a.price ?? undefined,
        })),
      tests: tests
        .filter((t): t is typeof t & { metrics: RunMetrics; finished_at: Date } => t.status === "SUCCEEDED" && !!t.metrics && !!t.finished_at && now - t.finished_at.getTime() < 3 * DAY)
        .map((t): FeedTest => ({ runId: t.id, name: t.name, finishedAt: t.finished_at.getTime(), definition: t.definition, metrics: t.metrics })),
      signals: entrySignals([...saved.values()], (id) => bars.get(id) ?? [], (id) => quotes.get(id)),
      closed,
    })
    return { items, following: interests.size }
  })
}
