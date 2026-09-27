import { createHash } from "node:crypto"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { SignIn, SignUp, passwordProblem } from "@greencircuits/contracts/account"
import { audit } from "../lib/audit"
import { mergeInto } from "../lib/merge"
import { hashPassword, verifyPassword } from "../lib/passwords"
import { endSession, getSession, startSession } from "../lib/session"
import { publicUser } from "../lib/users"
import { ALERTS_CHANGED } from "./me"

/**
 * Email and password accounts (ADR 0006). Sign-up turns the visitor's
 * anonymous user into the account, so nothing they made is lost; sign-in from
 * a browser used anonymously merges what was made there into the account.
 */

/** Five wrong passwords for an email lock it for fifteen minutes, on top of the per-IP limit. */
const FAILURES = { max: 5, windowSeconds: 15 * 60 }
const failureKey = (email: string) => `gc:login-failures:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === "23505"

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const db = app.db
  const strict = { rateLimit: { max: app.env.AUTH_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } }

  app.post("/auth/signup", { config: strict, schema: { tags: ["auth"], summary: "Create an account", body: SignUp } }, async (req, reply) => {
    const { email, password, name } = req.body
    const problem = passwordProblem(password, email)
    if (problem) return reply.code(400).send({ error: "weak_password", message: problem })
    const session = await getSession(req, reply)
    if (session && !session.anonymous) return reply.code(409).send({ error: "signed_in", message: "You're already signed in. Sign out to create another account." })

    const passwordHash = await hashPassword(password)
    let userId: string
    try {
      if (session) {
        // The visitor's anonymous user becomes the account, with everything they made.
        const updated = await db
          .updateTable("app.users")
          .set({ email, password_hash: passwordHash, name: name || null, is_anonymous: false, updated_at: new Date() })
          .where("id", "=", session.userId)
          .returning("id")
          .executeTakeFirstOrThrow()
        userId = updated.id
      } else {
        const created = await db
          .insertInto("app.users")
          .values({ email, password_hash: passwordHash, name: name || null, is_anonymous: false, last_seen_at: new Date() })
          .returning("id")
          .executeTakeFirstOrThrow()
        userId = created.id
      }
    } catch (err) {
      if (isUniqueViolation(err)) return reply.code(409).send({ error: "email_taken", message: "There's already an account with this email. Sign in instead?" })
      throw err
    }
    await startSession(req, reply, userId, false)
    audit(req, userId, "signup", { kept_anonymous_data: !!session })
    return reply.code(201).send({ user: await publicUser(db, userId) })
  })

  app.post("/auth/login", { config: strict, schema: { tags: ["auth"], summary: "Sign in", body: SignIn } }, async (req, reply) => {
    const { email, password } = req.body
    const key = failureKey(email)
    const failures = Number((await app.valkey.get(key).catch(() => null)) ?? 0)
    if (failures >= FAILURES.max) {
      return reply.code(429).send({ error: "locked", message: "Too many wrong passwords for this email. Try again in 15 minutes." })
    }
    const user = await db.selectFrom("app.users").select(["id", "password_hash", "status"]).where("email", "=", email).where("is_anonymous", "=", false).executeTakeFirst()
    // Always check a password, even for an unknown email, so timing doesn't say which exist.
    const ok = await verifyPassword(password, user?.password_hash)
    if (!user || !ok || user.status !== "ACTIVE") {
      await app.valkey.multi().incr(key).expire(key, FAILURES.windowSeconds).exec().catch(() => {})
      audit(req, user?.id ?? null, "login_failed")
      return reply.code(401).send({ error: "invalid_credentials", message: "That email and password don't match." })
    }
    await app.valkey.del(key).catch(() => {})

    const previous = await getSession(req, reply)
    const merged = !!previous?.anonymous && previous.userId !== user.id
    if (merged) {
      await mergeInto(db, previous.userId, user.id)
      await app.valkey.publish(ALERTS_CHANGED, user.id).catch(() => {})
    }
    await startSession(req, reply, user.id, false)
    audit(req, user.id, "login", { merged_anonymous_data: merged })
    return { user: await publicUser(db, user.id) }
  })

  app.post("/auth/logout", { schema: { tags: ["auth"], summary: "Sign out of this browser" } }, async (req, reply) => {
    const session = await getSession(req, reply)
    await endSession(req, reply)
    if (session && !session.anonymous) audit(req, session.userId, "logout")
    return reply.code(204).send()
  })
}
