import { z } from "zod"
import { DEFAULT_DATABASE_URL } from "@greencircuits/db"

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().default(DEFAULT_DATABASE_URL),
  VALKEY_URL: z.string().default("redis://localhost:6380"),
  /** Comma-separated origins allowed to call the API from a browser. */
  WEB_ORIGINS: z.string().default("http://localhost:3100,http://localhost:3000"),
  /** Signs the anonymous-session cookie. Set a long random value in production. */
  SESSION_SECRET: z.string().min(32).default("development-only-session-secret-change-me"),
  /** Requests per minute per client IP. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(1200),
})

export type Env = z.infer<typeof Env>

const DEV_SECRET = "development-only-session-secret-change-me"

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = Env.parse(source)
  if (env.NODE_ENV === "production" && env.SESSION_SECRET === DEV_SECRET) {
    throw new Error("SESSION_SECRET must be set in production")
  }
  return env
}
