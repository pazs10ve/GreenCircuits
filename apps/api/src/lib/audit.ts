import type { FastifyRequest } from "fastify"

/**
 * Account events go to ops.audit_log: sign-ups, sign-ins (and failed ones),
 * password changes, exports and deletions. Written in the background; a failed
 * write is logged, never shown to the user.
 */
export function audit(req: FastifyRequest, actorId: string | null, action: string, details: Record<string, unknown> = {}): void {
  void req.server.db
    .insertInto("ops.audit_log")
    .values({ actor_type: "USER", actor_id: actorId, action, target_type: "user", target_id: actorId, ip: req.ip, details: JSON.stringify(details) })
    .execute()
    .catch((err) => req.log.warn({ err, action }, "couldn't write to the audit log"))
}
