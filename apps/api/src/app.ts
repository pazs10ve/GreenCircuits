import Fastify, { LogController, type FastifyError, type FastifyServerOptions } from "fastify"
import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import rateLimit from "@fastify/rate-limit"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod"
import type { Redis } from "ioredis"
import type { Db } from "@greencircuits/db"
import type { Env } from "./env"
import { authRoutes } from "./modules/auth"
import { companyRoutes } from "./modules/companies"
import { feedRoutes } from "./modules/feed"
import { fundRoutes } from "./modules/funds"
import { healthRoutes } from "./modules/health"
import { instrumentRoutes } from "./modules/instruments"
import { labRoutes } from "./modules/lab"
import { marketRoutes } from "./modules/market"
import { meRoutes } from "./modules/me"
import { quoteRoutes } from "./modules/quotes"
import { referenceRoutes } from "./modules/reference"
import { universeRoutes } from "./modules/universe"

declare module "fastify" {
  interface FastifyInstance {
    db: Db
    valkey: Redis
    env: Env
  }
}

export interface AppDeps {
  db: Db
  valkey: Redis
  env: Env
  logger?: FastifyServerOptions["logger"]
}

/** Builds the API. Kept free of process concerns (ports, signals) so tests can use app.inject(). */
export async function buildApp({ db, valkey, env, logger = false }: AppDeps) {
  const app = Fastify({
    logger,
    trustProxy: true,
    logController: new LogController({ disableRequestLogging: env.NODE_ENV === "production" }),
  }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorate("db", db)
  app.decorate("valkey", valkey)
  app.decorate("env", env)

  await app.register(cookie, { secret: env.SESSION_SECRET })
  await app.register(cors, { origin: env.WEB_ORIGINS.split(",").map((o) => o.trim()), credentials: true })
  // Per-IP limits, counted in Valkey so every API instance shares them.
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_PER_MINUTE,
    timeWindow: "1 minute",
    redis: valkey,
    nameSpace: "gc:ratelimit:",
    skipOnError: true,
    allowList: (req) => req.url === "/health",
  })
  await app.register(swagger, {
    openapi: {
      info: { title: "GreenCircuits API", version: "0.1.0", description: "Research and strategy-testing data for Indian markets. Demo data: prices are simulated." },
      tags: [
        { name: "instruments" },
        { name: "quotes" },
        { name: "companies" },
        { name: "market" },
        { name: "ipos" },
        { name: "bonds" },
        { name: "auth", description: "Email and password accounts. Signing up keeps what the visitor made anonymously." },
        { name: "me", description: "Your data. The first write creates an anonymous account and a session cookie." },
        { name: "lab", description: "Backtests, queued on BullMQ and run by the Python engine." },
      ],
    },
    transform: jsonSchemaTransform,
  })
  await app.register(swaggerUi, { routePrefix: "/docs" })

  app.setErrorHandler<FastifyError>((err, req, reply) => {
    if (err.validation) return reply.code(400).send({ error: "bad_request", message: err.message })
    if (err.statusCode === 429) return reply.code(429).send({ error: "rate_limited", message: "Too many requests; slow down a little." })
    req.log.error(err)
    return reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).send({ error: "internal", message: "Something went wrong." })
  })

  await app.register(healthRoutes)
  await app.register(
    async (v1) => {
      await v1.register(instrumentRoutes)
      await v1.register(quoteRoutes)
      await v1.register(companyRoutes)
      await v1.register(marketRoutes)
      await v1.register(universeRoutes)
      await v1.register(fundRoutes)
      await v1.register(referenceRoutes)
      await v1.register(authRoutes)
      await v1.register(meRoutes)
      await v1.register(feedRoutes)
      await v1.register(labRoutes)
    },
    { prefix: "/v1" },
  )
  return app
}
