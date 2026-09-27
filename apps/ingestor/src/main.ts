import { createServer } from "node:http"
import { sql } from "kysely"
import { Redis } from "ioredis"
import { KEYS, type FeedSession } from "@greencircuits/contracts"
import { createDb, DEFAULT_DATABASE_URL, type Db } from "@greencircuits/db"
import { FLUSH_MS, createEngine, type Engine } from "@greencircuits/market/engine"
import { intradayCandles } from "@greencircuits/market/history"
import { marketSeed } from "@greencircuits/market/session"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { BarAggregator, type Bar } from "./bars"
import { loadUniverse } from "./universe"
import { hasRealData, runYahooFeed } from "./yahoo"

/**
 * The market feed. FEED_PROVIDER picks the source: "simulator" runs the market
 * simulator, which trades around the clock, publishing the quotes that changed
 * every 250 ms and writing 1-minute bars every few seconds; "yahoo" polls real
 * prices for local use (./yahoo.ts). Unset, it's "yahoo" once the real-data
 * loader has filled the database and "simulator" before. A broker adapter
 * would be a third.
 */

process.env.SERVICE_NAME ??= "ingestor"
const DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL
const VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6380"
/** How much intraday history to backfill on start: one session's length. */
const BACKFILL_MINUTES = 375
const HEALTH_PORT = Number(process.env.PORT ?? 4010)
const PROVIDER = process.env.FEED_PROVIDER || "auto"

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), svc: "ingestor", msg, ...extra }))

const istDay = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

async function writeBars(db: Db, bars: Bar[]) {
  if (bars.length === 0) return
  for (let i = 0; i < bars.length; i += 5000) {
    await db
      .insertInto("md.candle_1m")
      .values(
        bars.slice(i, i + 5000).map((b) => ({
          instrument_id: b.instrumentId,
          ts: new Date(b.minute),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
        })),
      )
      .onConflict((oc) =>
        oc.columns(["instrument_id", "ts"]).doUpdateSet((eb) => ({
          high: sql`greatest(md.candle_1m.high, ${eb.ref("excluded.high")})`,
          low: sql`least(md.candle_1m.low, ${eb.ref("excluded.low")})`,
          close: eb.ref("excluded.close"),
          volume: eb.ref("excluded.volume"),
        })),
      )
      .execute()
  }
}

/**
 * After a (re)start the simulated session begins again from the day's opening
 * state, so replace the last session's worth of 1-minute bars with a path that
 * ends where the market opens now, the way a broker adapter backfills history.
 */
async function backfill(db: Db, universe: Instrument[], opening: Quote[], now: number) {
  const since = new Date(now - BACKFILL_MINUTES * 60_000 - 60_000)
  await db.deleteFrom("md.candle_1m").where("ts", ">=", since).execute()
  const byId = new Map(opening.map((q) => [q.id, q]))
  const end = new Date(Math.floor(now / 60_000) * 60_000)
  const bars: Bar[] = []
  for (const inst of universe) {
    const q = byId.get(inst.id)
    if (!q) continue
    // intradayCandles bridges open → last over a session ending at `end`.
    const candles = intradayCandles(inst, q.open, q.ltp, 1, end, BACKFILL_MINUTES)
    const offset = end.getTime() - (candles.at(-1)!.time * 1000 + 60_000)
    for (const c of candles) {
      bars.push({ instrumentId: inst.id, minute: c.time * 1000 + offset, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })
    }
  }
  await writeBars(db, bars)
  return bars.length
}

async function main() {
  const db = createDb(DATABASE_URL, 4)
  const valkey = new Redis(VALKEY_URL, { maxRetriesPerRequest: null })
  const provider = PROVIDER === "auto" ? ((await hasRealData(db)) ? "yahoo" : "simulator") : PROVIDER
  if (provider === "yahoo") return runYahooFeed(db, valkey, log, HEALTH_PORT)
  if (provider !== "simulator") throw new Error(`Unknown FEED_PROVIDER "${provider}": use simulator or yahoo`)
  const universe = await loadUniverse(db)
  if (universe.length === 0) throw new Error("No instruments in ref.instrument. Run the loader: pnpm --filter @greencircuits/db seed")

  let day = istDay()
  let seed = marketSeed()
  let engine: Engine = createEngine(seed, Date.now(), universe)
  const bars = new BarAggregator()

  const publishSnapshot = async (quotes: Quote[]) => {
    const now = Date.now()
    const stamped = quotes.map((q) => ({ ...q, ts: now }))
    await valkey
      .multi()
      .del(KEYS.quotes)
      .hset(KEYS.quotes, Object.fromEntries(stamped.map((q) => [q.id, JSON.stringify(q)])))
      .set(KEYS.session, JSON.stringify({ provider: "simulator", source: "SIMULATED", seed, day, startedAt: now, instruments: universe.length } satisfies FeedSession))
      .set(KEYS.heartbeat, String(now))
      .exec()
    bars.update(stamped)
  }

  const opening = engine.snapshot()
  const backfilled = await backfill(db, universe, opening, Date.now())
  await publishSnapshot(opening)
  log("started", { instruments: universe.length, seed, day, backfilled })

  let ticks = 0
  let published = 0
  let lastFlush = Date.now()

  // Liveness for the orchestrator: healthy while flushes keep happening.
  const health = createServer((req, res) => {
    const stale = Date.now() - lastFlush > 5_000
    res.writeHead(req.url === "/health" ? (stale ? 503 : 200) : 404, { "content-type": "application/json" })
    res.end(JSON.stringify({ status: stale ? "stale" : "ok", day, seed, instruments: universe.length, lastFlushAgoMs: Date.now() - lastFlush }))
  }).listen(HEALTH_PORT)
  const loop = setInterval(async () => {
    try {
      if (istDay() !== day) {
        // A new IST day is a new simulated session.
        day = istDay()
        seed = marketSeed()
        engine = createEngine(seed, Date.now(), universe)
        await publishSnapshot(engine.snapshot())
        log("new session", { day, seed })
        return
      }
      const changed = engine.step()
      ticks++
      lastFlush = Date.now()
      if (changed.length === 0) return
      published += changed.length
      bars.update(changed)
      await valkey
        .pipeline()
        .hset(KEYS.quotes, Object.fromEntries(changed.map((q) => [q.id, JSON.stringify(q)])))
        .publish(KEYS.ticks, JSON.stringify(changed))
        .set(KEYS.heartbeat, String(Date.now()))
        .exec()
    } catch (err) {
      log("tick failed", { error: (err as Error).message })
    }
  }, FLUSH_MS)

  // Bars and the screener's live columns, every few seconds.
  const writer = setInterval(async () => {
    try {
      await writeBars(db, bars.drain())
    } catch (err) {
      log("bar write failed", { error: (err as Error).message })
    }
  }, 5_000)

  const snapshot = setInterval(async () => {
    try {
      const all = (await valkey.hvals(KEYS.quotes)).map((v) => JSON.parse(v) as Quote).filter((q) => q.id >= 100 && q.id < 300)
      if (all.length === 0) return
      await sql`
        UPDATE scr.equity_snapshot AS es SET price = v.price, change_pct = v.change_pct, price_updated_at = now()
        FROM (VALUES ${sql.join(all.map((q) => sql`(${q.id}::bigint, ${q.ltp}::float8, ${q.changePct}::float8)`))}) AS v(id, price, change_pct)
        WHERE es.instrument_id = v.id`.execute(db)
    } catch (err) {
      log("snapshot update failed", { error: (err as Error).message })
    }
  }, 60_000)

  const stats = setInterval(() => {
    log("stats", { ticks, quotesPublished: published })
    ticks = 0
    published = 0
  }, 60_000)

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, async () => {
      clearInterval(loop)
      clearInterval(writer)
      clearInterval(snapshot)
      clearInterval(stats)
      health.close()
      await writeBars(db, bars.drain()).catch(() => {})
      await db.destroy()
      valkey.disconnect()
      log("stopped", { signal })
      process.exit(0)
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
