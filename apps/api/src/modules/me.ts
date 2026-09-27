import { sql } from "kysely"
import { z } from "zod"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { ensureUser, sessionUserId } from "../lib/session"
import { istToday } from "../lib/dates"

/**
 * A visitor's own data: watchlists, alerts, notifications and portfolio.
 * GET /me and every write create an anonymous user if there's no session
 * (see lib/session); other reads never do, and answer empty instead. Alert
 * changes are announced on Valkey so the alert engine reloads without polling.
 */

export const ALERTS_CHANGED = "gc:alerts:changed"

const CONDITION_TO_KIND = {
  PRICE_ABOVE: "PRICE_ABOVE",
  PRICE_BELOW: "PRICE_BELOW",
  CHANGE_ABOVE: "CHANGE_PCT_ABOVE",
  CHANGE_BELOW: "CHANGE_PCT_BELOW",
} as const
const KIND_TO_CONDITION = Object.fromEntries(Object.entries(CONDITION_TO_KIND).map(([c, k]) => [k, c])) as Record<string, keyof typeof CONDITION_TO_KIND>

const Channel = z.enum(["IN_APP", "EMAIL", "TELEGRAM"])
const AlertInput = z.object({
  instrumentId: z.number().int().positive(),
  condition: z.enum(["PRICE_ABOVE", "PRICE_BELOW", "CHANGE_ABOVE", "CHANGE_BELOW"]),
  value: z.number().finite(),
  channels: z.array(Channel).min(1).max(3),
  repeat: z.boolean().default(false),
  note: z.string().trim().max(200).optional(),
})

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  const db = app.db

  const knownInstruments = async (ids: number[]) =>
    ids.length
      ? new Set((await db.selectFrom("ref.instrument").select("id").where("id", "in", ids).execute()).map((r) => r.id))
      : new Set<number>()

  app.get("/me", { schema: { tags: ["me"], summary: "The current (anonymous) user" } }, async (req, reply) => {
    const id = await ensureUser(req, reply)
    const user = await db.selectFrom("app.users").select(["id", "is_anonymous", "created_at"]).where("id", "=", id).executeTakeFirstOrThrow()
    return { id: user.id, anonymous: user.is_anonymous, createdAt: user.created_at }
  })

  // ------------------------------------------------------------------ watchlists

  const readWatchlists = async (userId: string) => {
    const rows = await db
      .selectFrom("app.watchlist as w")
      .leftJoin("app.watchlist_item as i", "i.watchlist_id", "w.id")
      .select(["w.id", "w.name", "w.position", "i.instrument_id", "i.position as item_position"])
      .where("w.user_id", "=", userId)
      .orderBy("w.position")
      .orderBy("i.position")
      .execute()
    const lists = new Map<string, { id: string; name: string; ids: number[] }>()
    for (const r of rows) {
      const list = lists.get(r.id) ?? { id: r.id, name: r.name, ids: [] }
      if (r.instrument_id != null) list.ids.push(r.instrument_id)
      lists.set(r.id, list)
    }
    return [...lists.values()]
  }

  app.get("/me/watchlists", { schema: { tags: ["me"], summary: "Your watchlists" } }, async (req) => {
    const userId = sessionUserId(req)
    return { lists: userId ? await readWatchlists(userId) : [] }
  })

  // The client sends its whole state; small, and it keeps ordering changes trivial.
  app.put(
    "/me/watchlists",
    {
      schema: {
        tags: ["me"],
        summary: "Replace your watchlists",
        body: z.object({
          lists: z
            .array(z.object({ name: z.string().trim().min(1).max(40), ids: z.array(z.number().int().positive()).max(200) }))
            .max(20)
            .refine((lists) => new Set(lists.map((l) => l.name.toLowerCase())).size === lists.length, "List names must be unique"),
        }),
      },
    },
    async (req, reply) => {
      const userId = await ensureUser(req, reply)
      const known = await knownInstruments([...new Set(req.body.lists.flatMap((l) => l.ids))])
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom("app.watchlist").where("user_id", "=", userId).execute()
        for (const [position, list] of req.body.lists.entries()) {
          const { id } = await trx.insertInto("app.watchlist").values({ user_id: userId, name: list.name, position }).returning("id").executeTakeFirstOrThrow()
          const ids = [...new Set(list.ids)].filter((i) => known.has(i))
          if (ids.length) await trx.insertInto("app.watchlist_item").values(ids.map((instrument_id, p) => ({ watchlist_id: id, instrument_id, position: p }))).execute()
        }
      })
      return { lists: await readWatchlists(userId) }
    },
  )

  // ---------------------------------------------------------------------- alerts

  const readAlerts = async (userId: string) => {
    const rows = await db
      .selectFrom("app.alert as a")
      .select([
        "a.id",
        "a.instrument_id",
        "a.kind",
        "a.threshold",
        "a.channels",
        "a.note",
        "a.status",
        "a.repeat_mode",
        "a.created_at",
        "a.last_triggered_at",
        sql<number | null>`(SELECT observed_value FROM app.alert_trigger t WHERE t.alert_id = a.id ORDER BY triggered_at DESC LIMIT 1)`.as("triggered_price"),
      ])
      .where("a.user_id", "=", userId)
      .where("a.kind", "in", Object.values(CONDITION_TO_KIND))
      .orderBy("a.created_at", "desc")
      .execute()
    return rows.map((r) => ({
      id: r.id,
      instrumentId: r.instrument_id!,
      condition: KIND_TO_CONDITION[r.kind]!,
      value: r.threshold!,
      channels: r.channels.filter((c) => Channel.options.includes(c as z.infer<typeof Channel>)),
      note: r.note ?? undefined,
      status: r.status === "EXPIRED" ? "PAUSED" : r.status,
      repeat: r.repeat_mode === "REARM_AFTER_COOLDOWN",
      createdAt: r.created_at,
      triggeredAt: r.last_triggered_at ?? undefined,
      triggeredPrice: r.triggered_price ?? undefined,
    }))
  }

  const announce = (userId: string) => app.valkey.publish(ALERTS_CHANGED, userId).catch(() => {})

  app.get("/me/alerts", { schema: { tags: ["me"], summary: "Your price and day-change alerts" } }, async (req) => {
    const userId = sessionUserId(req)
    return { alerts: userId ? await readAlerts(userId) : [] }
  })

  app.post("/me/alerts", { schema: { tags: ["me"], summary: "Create an alert", body: AlertInput } }, async (req, reply) => {
    const userId = await ensureUser(req, reply)
    const count = await db.selectFrom("app.alert").select(sql<number>`count(*)::int`.as("n")).where("user_id", "=", userId).executeTakeFirstOrThrow()
    if (count.n >= 100) return reply.code(409).send({ error: "limit", message: "You have 100 alerts, the most a plan allows." })
    if (!(await knownInstruments([req.body.instrumentId])).size) return reply.code(400).send({ error: "bad_request", message: "Unknown instrument." })
    const b = req.body
    const { id } = await db
      .insertInto("app.alert")
      .values({
        user_id: userId,
        kind: CONDITION_TO_KIND[b.condition],
        instrument_id: b.instrumentId,
        threshold: b.value,
        channels: b.channels,
        repeat_mode: b.repeat ? "REARM_AFTER_COOLDOWN" : "ONCE",
        cooldown: "1 day",
        note: b.note ?? null,
      })
      .returning("id")
      .executeTakeFirstOrThrow()
    await announce(userId)
    return reply.code(201).send({ alert: (await readAlerts(userId)).find((a) => a.id === id) })
  })

  app.patch(
    "/me/alerts/:id",
    {
      schema: {
        tags: ["me"],
        summary: "Pause, resume or re-arm an alert",
        params: z.object({ id: z.uuid() }),
        body: z.object({ status: z.enum(["ACTIVE", "PAUSED"]) }),
      },
    },
    async (req, reply) => {
      const userId = await ensureUser(req, reply)
      const updated = await db
        .updateTable("app.alert")
        .set((eb) => ({ status: req.body.status, version: eb("version", "+", 1), ...(req.body.status === "ACTIVE" ? { last_triggered_at: null } : {}) }))
        .where("id", "=", req.params.id)
        .where("user_id", "=", userId)
        .returning("id")
        .executeTakeFirst()
      if (!updated) return reply.code(404).send({ error: "not_found" })
      await announce(userId)
      return { alert: (await readAlerts(userId)).find((a) => a.id === updated.id) }
    },
  )

  app.delete(
    "/me/alerts/:id",
    { schema: { tags: ["me"], summary: "Delete an alert", params: z.object({ id: z.uuid() }) } },
    async (req, reply) => {
      const userId = await ensureUser(req, reply)
      const deleted = await db.deleteFrom("app.alert").where("id", "=", req.params.id).where("user_id", "=", userId).returning("id").executeTakeFirst()
      if (!deleted) return reply.code(404).send({ error: "not_found" })
      await announce(userId)
      return reply.code(204).send()
    },
  )

  // --------------------------------------------------------------- notifications

  app.get(
    "/me/notifications",
    {
      schema: {
        tags: ["me"],
        summary: "Your latest notifications, newest first",
        querystring: z.object({ after: z.iso.datetime().optional() }),
      },
    },
    async (req, reply) => {
      const userId = sessionUserId(req)
      reply.header("cache-control", "no-store")
      if (!userId) return { notifications: [] }
      let q = db
        .selectFrom("app.notification")
        .select(["id", "kind", "title", "body", "deeplink", "created_at", "read_at"])
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .limit(20)
      if (req.query.after) q = q.where("created_at", ">", new Date(req.query.after))
      return { notifications: await q.execute() }
    },
  )

  // ------------------------------------------------------------------- portfolio

  const defaultPortfolio = async (userId: string) => {
    const existing = await db.selectFrom("app.portfolio").select("id").where("user_id", "=", userId).orderBy("created_at").executeTakeFirst()
    if (existing) return existing.id
    return (await db.insertInto("app.portfolio").values({ user_id: userId, name: "Main" }).returning("id").executeTakeFirstOrThrow()).id
  }

  // Holdings are computed from transactions (the schema never stores positions).
  const readHoldings = async (portfolioId: string) => {
    const rows = await sql<{ instrument_id: number; qty: number; avg_price: number }>`
      SELECT instrument_id,
             sum(CASE WHEN txn_type = 'BUY' THEN quantity ELSE -quantity END)::float8 AS qty,
             (sum(CASE WHEN txn_type = 'BUY' THEN quantity * price ELSE 0 END)
               / nullif(sum(CASE WHEN txn_type = 'BUY' THEN quantity ELSE 0 END), 0))::float8 AS avg_price
      FROM app.portfolio_txn WHERE portfolio_id = ${portfolioId} AND txn_type IN ('BUY', 'SELL')
      GROUP BY instrument_id HAVING sum(CASE WHEN txn_type = 'BUY' THEN quantity ELSE -quantity END) > 0
      ORDER BY instrument_id`.execute(db)
    return rows.rows.map((r) => ({ instrumentId: r.instrument_id, qty: r.qty, avgPrice: r.avg_price }))
  }

  app.get("/me/portfolio", { schema: { tags: ["me"], summary: "Your holdings" } }, async (req) => {
    const userId = sessionUserId(req)
    if (!userId) return { holdings: [] }
    const portfolio = await db.selectFrom("app.portfolio").select("id").where("user_id", "=", userId).orderBy("created_at").executeTakeFirst()
    return { holdings: portfolio ? await readHoldings(portfolio.id) : [] }
  })

  // Importing a broker statement replaces the holdings with one BUY per position at its average cost.
  app.put(
    "/me/portfolio",
    {
      schema: {
        tags: ["me"],
        summary: "Replace your holdings (e.g. from a broker CSV)",
        body: z.object({
          holdings: z
            .array(z.object({ instrumentId: z.number().int().positive(), qty: z.number().positive().max(1e9), avgPrice: z.number().positive().max(1e7) }))
            .max(500),
          source: z.enum(["CSV", "MANUAL"]).default("CSV"),
        }),
      },
    },
    async (req, reply) => {
      const userId = await ensureUser(req, reply)
      const portfolioId = await defaultPortfolio(userId)
      const known = await knownInstruments(req.body.holdings.map((h) => h.instrumentId))
      const rows = req.body.holdings.filter((h) => known.has(h.instrumentId))
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom("app.portfolio_txn").where("portfolio_id", "=", portfolioId).execute()
        if (rows.length) {
          await trx
            .insertInto("app.portfolio_txn")
            .values(rows.map((h) => ({ portfolio_id: portfolioId, instrument_id: h.instrumentId, txn_type: "BUY", trade_date: istToday(), quantity: h.qty, price: h.avgPrice, source: req.body.source })))
            .execute()
        }
      })
      return { holdings: await readHoldings(portfolioId) }
    },
  )
}
