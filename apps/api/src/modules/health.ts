import { sql } from "kysely"
import { KEYS } from "@greencircuits/contracts"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"

/** Liveness and dependencies: Postgres, Valkey and how fresh the ingestor's quotes are. */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/health", { schema: { hide: true } }, async (_req, reply) => {
    const check = async (fn: () => Promise<unknown>) => {
      const start = performance.now()
      try {
        await fn()
        return { ok: true, ms: Math.round(performance.now() - start) }
      } catch (err) {
        return { ok: false, ms: Math.round(performance.now() - start), error: (err as Error).message }
      }
    }
    const [db, valkey] = await Promise.all([check(() => sql`select 1`.execute(app.db)), check(() => app.valkey.ping())])
    let feed: { lastTickAgoMs: number | null; quotes: number } = { lastTickAgoMs: null, quotes: 0 }
    if (valkey.ok) {
      const [beat, count] = await Promise.all([app.valkey.get(KEYS.heartbeat), app.valkey.hlen(KEYS.quotes)])
      feed = { lastTickAgoMs: beat ? Date.now() - Number(beat) : null, quotes: count }
    }
    const ok = db.ok && valkey.ok
    return reply.code(ok ? 200 : 503).send({ status: ok ? "ok" : "degraded", db, valkey, feed })
  })
}
