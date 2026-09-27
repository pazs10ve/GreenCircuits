import { createServer } from "node:http"
import { sql } from "kysely"
import { Redis } from "ioredis"
import { KEYS } from "@greencircuits/contracts"
import { createDb, DEFAULT_DATABASE_URL, type Db } from "@greencircuits/db"
import { getInstrument } from "@greencircuits/market/catalog"
import { formatPct, formatPrice } from "@greencircuits/market/format"
import type { Quote } from "@greencircuits/market/types"
import { AlertBook, type AlertKind, type LiveAlert } from "./book"

/**
 * The alert engine. Keeps every active price and day-change alert in memory,
 * checks the instruments that moved on each tick, and fires an alert by
 * claiming it with a conditional UPDATE in Postgres, so it fires exactly once
 * even with several engines running. Each firing writes the trigger, an in-app
 * notification and its delivery records in one transaction.
 */

process.env.SERVICE_NAME ??= "alerts"
const DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL
const VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6380"
const PORT = Number(process.env.PORT ?? 4011)
/** The API announces alert edits here (see apps/api/src/modules/me.ts). */
const ALERTS_CHANGED = "gc:alerts:changed"
/** Fired notifications, for anything that wants to push them (the stream gateway, later). */
const NOTIFY = "gc:notify"

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), svc: "alerts", msg, ...extra }))

const KINDS: AlertKind[] = ["PRICE_ABOVE", "PRICE_BELOW", "CHANGE_PCT_ABOVE", "CHANGE_PCT_BELOW"]

async function loadActive(db: Db): Promise<LiveAlert[]> {
  const rows = await db
    .selectFrom("app.alert")
    .select(["id", "version", "user_id", "instrument_id", "kind", "threshold", "repeat_mode", "last_triggered_at", "note", sql<number>`extract(epoch FROM cooldown) * 1000`.as("cooldown_ms")])
    .where("status", "=", "ACTIVE")
    .where("kind", "in", KINDS)
    .where((eb) => eb.or([eb("expires_at", "is", null), eb("expires_at", ">", new Date())]))
    .execute()
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    userId: r.user_id,
    instrumentId: r.instrument_id!,
    kind: r.kind as AlertKind,
    threshold: r.threshold!,
    repeat: r.repeat_mode === "REARM_AFTER_COOLDOWN",
    cooldownMs: Number(r.cooldown_ms),
    lastTriggeredAt: r.last_triggered_at ? r.last_triggered_at.getTime() : null,
    note: r.note,
  }))
}

function describe(a: LiveAlert, q: Quote): { title: string; body: string; deeplink: string } {
  const inst = getInstrument(a.instrumentId)
  const symbol = inst?.symbol ?? `#${a.instrumentId}`
  const level = a.kind.startsWith("CHANGE") ? formatPct(a.threshold) : `₹${formatPrice(a.threshold, inst?.tick)}`
  const verb = { PRICE_ABOVE: "rose above", PRICE_BELOW: "fell below", CHANGE_PCT_ABOVE: "is up more than", CHANGE_PCT_BELOW: "is down more than" }[a.kind]
  return {
    title: `${symbol} ${verb} ${level}`,
    body: `Now ₹${formatPrice(q.ltp, inst?.tick)} (${formatPct(q.changePct)} today).${a.note ? ` ${a.note}` : ""}`,
    deeplink: inst ? `/stocks/${inst.slug}` : "/alerts",
  }
}

/** Claim and record one firing. Returns false if another engine, or an edit, got there first. */
async function fire(db: Db, a: LiveAlert, q: Quote): Promise<{ notificationId: string } | null> {
  return db.transaction().execute(async (trx) => {
    const claimed = await trx
      .updateTable("app.alert")
      .set((eb) => ({
        status: sql`CASE WHEN repeat_mode = 'ONCE' THEN 'TRIGGERED' ELSE status END`,
        last_triggered_at: new Date(),
        trigger_count: eb("trigger_count", "+", 1),
      }))
      .where("id", "=", a.id)
      .where("version", "=", a.version)
      .where("status", "=", "ACTIVE")
      .where((eb) => eb.or([eb("last_triggered_at", "is", null), eb("last_triggered_at", "<=", sql<Date>`now() - cooldown`)]))
      .returning(["user_id", "channels"])
      .executeTakeFirst()
    if (!claimed) return null

    const trigger = await trx
      .insertInto("app.alert_trigger")
      .values({ alert_id: a.id, alert_version: a.version, observed_value: a.kind.startsWith("CHANGE") ? q.changePct : q.ltp, payload: JSON.stringify({ ltp: q.ltp, changePct: q.changePct, ts: q.ts }) })
      .returning("id")
      .executeTakeFirstOrThrow()
    const text = describe(a, q)
    const note = await trx
      .insertInto("app.notification")
      .values({ user_id: claimed.user_id, kind: "ALERT", title: text.title, body: text.body, deeplink: text.deeplink, dedupe_key: `alert_trigger:${trigger.id}` })
      .returning("id")
      .executeTakeFirstOrThrow()
    // In-app delivery is the notification row itself. Email and Telegram need a verified account.
    await trx
      .insertInto("app.notification_delivery")
      .values(
        claimed.channels.map((channel) =>
          channel === "IN_APP"
            ? { notification_id: note.id, channel, status: "SENT", attempts: 1 }
            : { notification_id: note.id, channel, status: "SKIPPED", last_error: "Needs a verified account; not configured in the demo." },
        ),
      )
      .execute()
    return { notificationId: note.id }
  })
}

async function main() {
  const db = createDb(DATABASE_URL, 4)
  const valkey = new Redis(VALKEY_URL)
  const subscriber = new Redis(VALKEY_URL)
  const book = new AlertBook()
  let fired = 0

  const reload = async () => {
    book.load(await loadActive(db))
    log("alerts loaded", { active: book.size })
  }
  await reload()

  let pending: ReturnType<typeof setTimeout> | undefined
  await subscriber.subscribe(KEYS.ticks, ALERTS_CHANGED)
  subscriber.on("message", (channel, message) => {
    if (channel === ALERTS_CHANGED) {
      // Coalesce bursts of edits into one reload.
      clearTimeout(pending)
      pending = setTimeout(() => void reload().catch((err) => log("reload failed", { error: (err as Error).message })), 200)
      return
    }
    const now = Date.now()
    for (const q of JSON.parse(message) as Quote[]) {
      for (const a of book.due(q, now)) {
        book.claim(a)
        fire(db, a, q)
          .then(async (result) => {
            book.settle(a, result != null, Date.now())
            if (!result) return
            fired++
            await valkey.publish(NOTIFY, JSON.stringify({ userId: a.userId, notificationId: result.notificationId }))
            log("fired", { alert: a.id, instrument: a.instrumentId, ltp: q.ltp })
          })
          .catch((err) => {
            book.settle(a, false, Date.now())
            log("fire failed", { alert: a.id, error: (err as Error).message })
          })
      }
    }
  })

  const health = createServer((req, res) => {
    res.writeHead(req.url === "/health" ? 200 : 404, { "content-type": "application/json" })
    res.end(JSON.stringify({ status: "ok", active: book.size, fired }))
  }).listen(PORT)
  log("started", { active: book.size, port: PORT })

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, async () => {
      health.close()
      subscriber.disconnect()
      valkey.disconnect()
      await db.destroy()
      log("stopped", { signal })
      process.exit(0)
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
