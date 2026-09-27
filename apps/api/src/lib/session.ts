import type { FastifyReply, FastifyRequest } from "fastify"

/**
 * Anonymous sessions. The first time a visitor saves something, they get a
 * real row in app.users (is_anonymous) and a signed, httpOnly cookie holding
 * its id. Signing up later can fill in email or phone on the same row.
 */

export const SESSION_COOKIE = "gc_uid"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The signed-in (anonymous) user's id, or null. Never trusts an unsigned cookie. */
export function sessionUserId(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE]
  if (!raw) return null
  const { valid, value } = req.unsignCookie(raw)
  return valid && value && UUID.test(value) ? value : null
}

/** The current user's id, creating an anonymous user and setting the cookie if there isn't one. */
export async function ensureUser(req: FastifyRequest, reply: FastifyReply): Promise<string> {
  const existing = sessionUserId(req)
  if (existing) {
    const row = await req.server.db
      .updateTable("app.users")
      .set({ last_seen_at: new Date() })
      .where("id", "=", existing)
      .returning("id")
      .executeTakeFirst()
    if (row) return row.id
  }
  const created = await req.server.db
    .insertInto("app.users")
    .values({ is_anonymous: true, last_seen_at: new Date() })
    .returning("id")
    .executeTakeFirstOrThrow()
  reply.setCookie(SESSION_COOKIE, created.id, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86400,
  })
  return created.id
}
