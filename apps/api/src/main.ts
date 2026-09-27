import { Redis } from "ioredis"
import { createDb } from "@greencircuits/db"
import { buildApp } from "./app"
import { loadEnv } from "./env"

process.env.SERVICE_NAME ??= "api"
const env = loadEnv()
const db = createDb(env.DATABASE_URL, 20)
const valkey = new Redis(env.VALKEY_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false })

const app = await buildApp({
  db,
  valkey,
  env,
  logger: env.NODE_ENV === "development" ? { level: "info", transport: { target: "pino-pretty", options: { colorize: true, ignore: "pid,hostname" } } } : { level: "info" },
})

await app.listen({ host: env.HOST, port: env.PORT })

// Finish in-flight requests, then release connections.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "shutting down")
    await app.close()
    await db.destroy()
    valkey.disconnect()
    process.exit(0)
  })
}
