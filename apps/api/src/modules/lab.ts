import { createHash } from "node:crypto"
import { Queue } from "bullmq"
import { sql } from "kysely"
import { z } from "zod"
import { BacktestRequest, type StrategyDefinition } from "@greencircuits/contracts/strategy"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { ensureUser, sessionUserId } from "../lib/session"

/**
 * Backtests. The run's durable record is lab.backtest_run; the BullMQ
 * "backtests" queue only carries the run id (docs/adr/0001). Python workers
 * pick jobs up, update progress on the row, and write results and trades.
 */

/** Bumped whenever the engine's results could change for the same inputs. */
export const ENGINE_VERSION = "py-0.4"

const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v))

function instrumentsOf(d: StrategyDefinition): number[] {
  return d.type === "rules" ? d.universe : [d.instrumentId]
}

export const labRoutes: FastifyPluginAsyncZod = async (app) => {
  const queue = new Queue("backtests", { connection: app.valkey.duplicate({ maxRetriesPerRequest: null }) })
  app.addHook("onClose", async () => queue.close())
  const db = app.db

  app.post("/me/backtests", { schema: { tags: ["lab"], summary: "Queue a backtest", body: BacktestRequest } }, async (req, reply) => {
    const userId = await ensureUser(req, reply)
    const b = req.body
    const ids = instrumentsOf(b.definition)
    const coverage = await db
      .selectFrom("md.candle_1d")
      .select(["instrument_id", sql<string>`min(trade_date)::text`.as("first"), sql<string>`max(trade_date)::text`.as("last")])
      .where("instrument_id", "in", ids)
      .groupBy("instrument_id")
      .execute()
    if (coverage.length !== new Set(ids).size) return reply.code(400).send({ error: "bad_request", message: "Some instruments have no price history." })
    const dataVersion = coverage.map((c) => c.last).sort().at(-1)!

    const cacheKey = createHash("sha256")
      .update(stable({ definition: b.definition, from: b.from, to: b.to, capital: b.capital, slippage: b.slippageBps, dataVersion, engine: ENGINE_VERSION }))
      .digest("hex")
    const cached = await db
      .selectFrom("lab.backtest_run")
      .select("id")
      .where("user_id", "=", userId)
      .where("cache_key", "=", cacheKey)
      .where("status", "=", "SUCCEEDED")
      .executeTakeFirst()
    if (cached) return reply.code(200).send({ runId: cached.id, status: "SUCCEEDED", cached: true })

    const runId = await db.transaction().execute(async (trx) => {
      // Same name and same rules reuse the latest version; changed rules add one.
      const existing = await trx.selectFrom("lab.strategy").select(["id", "latest_version"]).where("user_id", "=", userId).where("name", "=", b.name).executeTakeFirst()
      let strategyId: string
      let version: number
      if (!existing) {
        strategyId = (
          await trx
            .insertInto("lab.strategy")
            .values({ user_id: userId, name: b.name, description: b.description ?? null, style: b.definition.type === "rules" ? "RULES" : "PORTFOLIO" })
            .returning("id")
            .executeTakeFirstOrThrow()
        ).id
        version = 1
        await trx.insertInto("lab.strategy_version").values({ strategy_id: strategyId, version, definition: JSON.stringify(b.definition) }).execute()
      } else {
        strategyId = existing.id
        const latest = await trx
          .selectFrom("lab.strategy_version")
          .select("definition")
          .where("strategy_id", "=", strategyId)
          .where("version", "=", existing.latest_version)
          .executeTakeFirstOrThrow()
        version = existing.latest_version
        if (stable(latest.definition) !== stable(b.definition)) {
          version += 1
          await trx.insertInto("lab.strategy_version").values({ strategy_id: strategyId, version, definition: JSON.stringify(b.definition) }).execute()
          await trx.updateTable("lab.strategy").set({ latest_version: version }).where("id", "=", strategyId).execute()
        }
      }
      const run = await trx
        .insertInto("lab.backtest_run")
        .values({
          user_id: userId,
          strategy_id: strategyId,
          strategy_version: version,
          params: JSON.stringify({ benchmarkId: 1 }),
          bar_interval: "1d",
          date_from: b.from,
          date_to: b.to,
          initial_capital: b.capital,
          slippage_bps: b.slippageBps,
          data_version: dataVersion,
          engine_version: ENGINE_VERSION,
          cache_key: cacheKey,
        })
        .returning("id")
        .executeTakeFirstOrThrow()
      return run.id
    })

    // The row is the record; the job is only a pointer to it. A reconciler can re-enqueue from the row.
    await queue.add("run", { runId }, { jobId: runId, attempts: 2, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 1000, removeOnFail: 1000 })
    return reply.code(202).send({ runId, status: "QUEUED", cached: false })
  })

  app.get("/me/backtests", { schema: { tags: ["lab"], summary: "Your recent backtests" } }, async (req) => {
    const userId = sessionUserId(req)
    if (!userId) return { runs: [] }
    const runs = await db
      .selectFrom("lab.backtest_run as r")
      .innerJoin("lab.strategy as s", "s.id", "r.strategy_id")
      .innerJoin("lab.strategy_version as v", (j) => j.onRef("v.strategy_id", "=", "r.strategy_id").onRef("v.version", "=", "r.strategy_version"))
      .leftJoin("lab.backtest_result as res", "res.run_id", "r.id")
      .select([
        "r.id",
        "s.name",
        "r.strategy_version",
        "v.definition",
        "r.status",
        "r.progress_pct",
        "r.queued_at",
        "r.started_at",
        "r.finished_at",
        "r.date_from",
        "r.date_to",
        "r.error",
        "res.metrics",
      ])
      .where("r.user_id", "=", userId)
      .orderBy("r.queued_at", "desc")
      .limit(20)
      .execute()
    return { runs }
  })

  app.get(
    "/me/backtests/:id",
    { schema: { tags: ["lab"], summary: "A backtest's status, results and trades", params: z.object({ id: z.uuid() }) } },
    async (req, reply) => {
      const userId = sessionUserId(req)
      if (!userId) return reply.code(404).send({ error: "not_found" })
      const run = await db
        .selectFrom("lab.backtest_run as r")
        .innerJoin("lab.strategy as s", "s.id", "r.strategy_id")
        .innerJoin("lab.strategy_version as v", (j) => j.onRef("v.strategy_id", "=", "r.strategy_id").onRef("v.version", "=", "r.strategy_version"))
        .select([
          "r.id",
          "s.name",
          "r.strategy_version",
          "v.definition",
          "r.status",
          "r.progress_pct",
          "r.queued_at",
          "r.started_at",
          "r.finished_at",
          "r.date_from",
          "r.date_to",
          "r.initial_capital",
          "r.slippage_bps",
          "r.error",
          "r.engine_version",
          "r.data_version",
        ])
        .where("r.id", "=", req.params.id)
        .where("r.user_id", "=", userId)
        .executeTakeFirst()
      if (!run) return reply.code(404).send({ error: "not_found" })
      reply.header("cache-control", "no-store")
      if (run.status === "QUEUED" || run.status === "RUNNING") {
        const ahead = await db
          .selectFrom("lab.backtest_run")
          .select(sql<number>`count(*)::int`.as("n"))
          .where("status", "=", "QUEUED")
          .where("queued_at", "<", run.queued_at)
          .executeTakeFirstOrThrow()
        return { run, queuePosition: run.status === "QUEUED" ? ahead.n + 1 : 0 }
      }
      const [result, trades] = await Promise.all([
        db.selectFrom("lab.backtest_result").selectAll().where("run_id", "=", run.id).executeTakeFirst(),
        db.selectFrom("lab.backtest_trade").selectAll().where("run_id", "=", run.id).orderBy("trade_no").limit(1000).execute(),
      ])
      return { run, result: result ?? null, trades }
    },
  )

  app.delete(
    "/me/backtests/:id",
    { schema: { tags: ["lab"], summary: "Delete a backtest", params: z.object({ id: z.uuid() }) } },
    async (req, reply) => {
      const userId = sessionUserId(req)
      if (!userId) return reply.code(404).send({ error: "not_found" })
      // A queued job for it finds no row and is skipped by the worker.
      const deleted = await db.deleteFrom("lab.backtest_run").where("id", "=", req.params.id).where("user_id", "=", userId).returning("id").executeTakeFirst()
      if (!deleted) return reply.code(404).send({ error: "not_found" })
      return reply.code(204).send()
    },
  )
}
