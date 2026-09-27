import { createHash, randomBytes } from "node:crypto"
import type { FastifyReply, FastifyRequest } from "fastify"

/**
 * Sessions (ADR 0006). Every visitor has a user row: anonymous until they
 * sign up, which keeps their data. The browser holds a random token in an
 * httpOnly cookie; the database holds only its SHA-256, with an expiry that
 * slides forward while the session is used. Signing in replaces the token,
 * signing out deletes the row, and a password change ends every other session.
 */

export const SESSION_COOKIE = "gc_session"
/** The signed user-id cookie from before sessions existed; read once, then replaced. */
export const LEGACY_COOKIE = "gc_uid"

const DAY = 86_400_000
const TTL = { anonymous: 365 * DAY, account: 30 * DAY }
/** Extend a session's expiry at most this often, so busy pages don't write on every request. */
const RENEW_EVERY = 60 * 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface Session {
  id: string
  userId: string
  anonymous: boolean
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest()
const memo = new WeakMap<FastifyRequest, Promise<Session | null>>()

function setCookie(reply: FastifyReply, token: string, anonymous: boolean) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: (anonymous ? TTL.anonymous : TTL.account) / 1000,
  })
}

async function lookup(req: FastifyRequest, reply: FastifyReply): Promise<Session | null> {
  const db = req.server.db
  const token = req.cookies[SESSION_COOKIE]
  if (token && token.length <= 64) {
    const row = await db
      .selectFrom("app.session as s")
      .innerJoin("app.users as u", "u.id", "s.user_id")
      .select(["s.id", "s.user_id", "s.last_seen_at", "u.is_anonymous", "u.status"])
      .where("s.token_hash", "=", tokenHash(token))
      .where("s.expires_at", ">", new Date())
      .executeTakeFirst()
    if (row && row.status === "ACTIVE") {
      if (Date.now() - row.last_seen_at.getTime() > RENEW_EVERY) {
        const now = new Date()
        const ttl = row.is_anonymous ? TTL.anonymous : TTL.account
        void db
          .updateTable("app.session")
          .set({ last_seen_at: now, expires_at: new Date(now.getTime() + ttl) })
          .where("id", "=", row.id)
          .execute()
          .then(() => db.updateTable("app.users").set({ last_seen_at: now }).where("id", "=", row.user_id).execute())
          .catch((err) => req.log.warn({ err }, "couldn't renew a session"))
        setCookie(reply, token, row.is_anonymous)
      }
      return { id: row.id, userId: row.user_id, anonymous: row.is_anonymous }
    }
  }
  // A visitor from before sessions: trust only a correctly signed id, then move them to a session.
  const legacy = req.cookies[LEGACY_COOKIE]
  if (legacy) {
    reply.clearCookie(LEGACY_COOKIE, { path: "/" })
    const { valid, value } = req.unsignCookie(legacy)
    if (valid && value && UUID.test(value)) {
      const user = await db.selectFrom("app.users").select(["id", "is_anonymous", "status"]).where("id", "=", value).executeTakeFirst()
      if (user?.status === "ACTIVE") return startSession(req, reply, user.id, user.is_anonymous)
    }
  }
  return null
}

/** The request's session, or null. Looked up once per request. */
export function getSession(req: FastifyRequest, reply: FastifyReply): Promise<Session | null> {
  let session = memo.get(req)
  if (!session) {
    session = lookup(req, reply)
    memo.set(req, session)
  }
  return session
}

/** Starts a fresh session for a user, replacing the request's current one (so a token set before sign-in is useless after it). */
export async function startSession(req: FastifyRequest, reply: FastifyReply, userId: string, anonymous: boolean): Promise<Session> {
  const db = req.server.db
  const previous = req.cookies[SESSION_COOKIE]
  if (previous && previous.length <= 64) await db.deleteFrom("app.session").where("token_hash", "=", tokenHash(previous)).execute()
  const token = randomBytes(32).toString("base64url")
  const row = await db
    .insertInto("app.session")
    .values({
      user_id: userId,
      token_hash: tokenHash(token),
      expires_at: new Date(Date.now() + (anonymous ? TTL.anonymous : TTL.account)),
      user_agent: req.headers["user-agent"]?.slice(0, 300) ?? null,
      ip: req.ip,
    })
    .returning("id")
    .executeTakeFirstOrThrow()
  setCookie(reply, token, anonymous)
  // Later reads in this request see the new session, not the one it replaced.
  const session = { id: row.id, userId, anonymous }
  memo.set(req, Promise.resolve(session))
  req.cookies[SESSION_COOKIE] = token
  return session
}

/** The current session, creating an anonymous user (and session) if there isn't one. */
export async function ensureSession(req: FastifyRequest, reply: FastifyReply): Promise<Session> {
  const existing = await getSession(req, reply)
  if (existing) return existing
  const user = await req.server.db.insertInto("app.users").values({ is_anonymous: true, last_seen_at: new Date() }).returning("id").executeTakeFirstOrThrow()
  return startSession(req, reply, user.id, true)
}

export async function endSession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = await getSession(req, reply)
  if (session) await req.server.db.deleteFrom("app.session").where("id", "=", session.id).execute()
  reply.clearCookie(SESSION_COOKIE, { path: "/" })
  memo.set(req, Promise.resolve(null))
}

/** The current user's id, or null. Reads never create a user. */
export async function userIdOf(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  return (await getSession(req, reply))?.userId ?? null
}

/** The current user's id, creating an anonymous user if there isn't one. Writes use this. */
export async function ensureUser(req: FastifyRequest, reply: FastifyReply): Promise<string> {
  return (await ensureSession(req, reply)).userId
}
