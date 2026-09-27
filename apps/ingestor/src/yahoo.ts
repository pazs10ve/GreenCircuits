import { createServer } from "node:http"
import { sql } from "kysely"
import type { Redis } from "ioredis"
import { KEYS, type FeedSession, type Source } from "@greencircuits/contracts"
import type { Db } from "@greencircuits/db"
import type { Quote } from "@greencircuits/market/types"

/**
 * Real prices from Yahoo Finance, for running GreenCircuits locally (ADR 0007),
 * chosen with FEED_PROVIDER=yahoo or by default once real data is loaded. It polls Yahoo's batch endpoint (20 symbols a request)
 * every minute while NSE is open, and every 15 minutes otherwise, because gold,
 * crude and the rupee trade longer. Quotes reach Valkey and the gateway exactly
 * as the simulator's do. One-minute closes go to md.candle_1m and today's
 * daily bar to md.candle_1d, so the history keeps growing while this runs.
 * Needs the real-data loader first (pnpm data:real), which records each
 * instrument's Yahoo symbol.
 */

const SPARK = "https://query1.finance.yahoo.com/v7/finance/spark"
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
const OPEN_EVERY_MS = 60_000
const CLOSED_EVERY_MS = 15 * 60_000
const BATCH = 20

interface Listed {
  id: number
  kind: string
  tick: number
  yahoo: string
  /** For commodities quoted in dollars: rupees per unit = price × USD/INR × this. */
  usdPerUnit: number | null
}

interface Series {
  price: number
  previousClose: number
  high: number
  low: number
  volume: number
  /** Unix seconds of the last trade. */
  time: number
  gmtoffset: number
  bars: { t: number; close: number }[]
}

interface SparkResponse {
  meta: {
    regularMarketPrice?: number
    previousClose?: number
    chartPreviousClose?: number
    regularMarketDayHigh?: number
    regularMarketDayLow?: number
    regularMarketVolume?: number
    regularMarketTime?: number
    gmtoffset?: number
  }
  timestamp?: number[]
  indicators?: { quote?: { close?: (number | null)[] }[] }
}

/** Whether the real-data loader has filled the database (it marks every instrument it loads). */
export async function hasRealData(db: Db): Promise<boolean> {
  const { rows } = await sql<{ real: boolean }>`SELECT EXISTS (SELECT 1 FROM ref.instrument WHERE attrs->>'dataSource' = 'REAL') AS real`.execute(db)
  return rows[0]?.real ?? false
}

/** NSE's cash session in IST, weekdays 09:15–15:30. Exchange holidays aren't known here; on those, the prices simply don't move. */
export function nseOpen(now = new Date()): boolean {
  const ist = new Date(now.getTime() + 5.5 * 3600_000)
  const day = ist.getUTCDay()
  if (day === 0 || day === 6) return false
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// To the tick, then to 4 decimals so float noise (729.5500000000001) never reaches the wire.
const roundTo = (v: number, tick: number) => Math.round(Math.round(v / tick) * tick * 1e4) / 1e4
const localDay = (seconds: number, gmtoffset: number) => new Date((seconds + gmtoffset) * 1000).toISOString().slice(0, 10)

async function spark(symbols: string[]): Promise<Map<string, Series>> {
  const out = new Map<string, Series>()
  for (let i = 0; i < symbols.length; i += BATCH) {
    const chunk = symbols.slice(i, i + BATCH)
    const res = await fetch(`${SPARK}?symbols=${chunk.map(encodeURIComponent).join(",")}&range=1d&interval=1m`, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`Yahoo answered ${res.status}`)
    const body = (await res.json()) as { spark?: { result?: { symbol: string; response?: SparkResponse[] }[] | null } }
    for (const r of body.spark?.result ?? []) {
      const x = r.response?.[0]
      const m = x?.meta
      if (!x || !m?.regularMarketPrice || !m.regularMarketTime) continue
      const closes = x.indicators?.quote?.[0]?.close ?? []
      const bars = (x.timestamp ?? [])
        .map((t, k) => ({ t, close: closes[k] }))
        .filter((b): b is { t: number; close: number } => b.close != null && Number.isFinite(b.close))
      out.set(r.symbol, {
        price: m.regularMarketPrice,
        previousClose: m.previousClose ?? m.chartPreviousClose ?? m.regularMarketPrice,
        high: m.regularMarketDayHigh ?? m.regularMarketPrice,
        low: m.regularMarketDayLow ?? m.regularMarketPrice,
        volume: m.regularMarketVolume ?? 0,
        time: m.regularMarketTime,
        gmtoffset: m.gmtoffset ?? 0,
        bars,
      })
    }
    await sleep(400) // a pause between batches, to stay well inside Yahoo's limits
  }
  return out
}

function toQuote(inst: Listed, s: Series, scale: number, previous?: Quote): Quote {
  const px = (v: number) => roundTo(v * scale, inst.tick)
  const ltp = px(s.price)
  const prevClose = px(s.previousClose)
  const open = px(s.bars[0]?.close ?? s.previousClose)
  const change = ltp - prevClose
  return {
    id: inst.id,
    ltp,
    open,
    high: Math.max(px(s.high), ltp, open),
    low: Math.min(px(s.low), ltp, open),
    prevClose,
    change,
    changePct: prevClose ? (change / prevClose) * 100 : 0,
    volume: s.volume,
    bid: ltp,
    ask: ltp,
    ts: s.time * 1000,
    tickDir: previous ? (ltp > previous.ltp ? 1 : ltp < previous.ltp ? -1 : 0) : 0,
  }
}

type Log = (msg: string, extra?: Record<string, unknown>) => void

export async function runYahooFeed(db: Db, valkey: Redis, log: Log, port: number): Promise<void> {
  const rows = await db
    .selectFrom("ref.instrument")
    .select(["id", "kind", "tick_size", sql<string>`attrs->>'yahoo'`.as("yahoo"), sql<number | null>`(attrs->>'usdPerUnit')::float8`.as("usd_per_unit")])
    .where("status", "=", "ACTIVE")
    .where(sql<boolean>`attrs ? 'yahoo'`)
    .orderBy("id")
    .execute()
  if (rows.length === 0) throw new Error("No instrument has a Yahoo symbol yet. Load real data first: pnpm data:real")
  const listed: Listed[] = rows.map((r) => ({ id: r.id, kind: r.kind, tick: r.tick_size, yahoo: r.yahoo, usdPerUnit: r.usd_per_unit }))
  const symbols = listed.map((l) => l.yahoo)

  // The simulator's one-minute bars would sit under the real ones on the intraday charts.
  await db.deleteFrom("md.candle_1m").where("ts", ">=", new Date(Date.now() - 7 * 86_400_000)).execute()

  const last = new Map<number, Quote>()
  let source: Source = "EOD"
  let lastPoll = 0
  let failures = 0
  const startedAt = Date.now()

  const poll = async () => {
    const series = await spark(symbols)
    // Dollar commodities convert at this same poll's rupee rate.
    const fx = series.get("USDINR=X")?.price
    const quotes: Quote[] = []
    const minuteBars: { instrument_id: number; ts: Date; open: number; high: number; low: number; close: number; volume: number }[] = []
    const dailyBars: { instrument_id: number; trade_date: string; open: number; high: number; low: number; close: number; last_price: number; prev_close: number; volume: number; source: string }[] = []
    for (const inst of listed) {
      const s = series.get(inst.yahoo)
      if (!s) continue
      if (inst.usdPerUnit && !fx) continue
      const scale = inst.usdPerUnit ? inst.usdPerUnit * fx! : 1
      const q = toQuote(inst, s, scale, last.get(inst.id))
      quotes.push(q)
      for (const b of s.bars) {
        const close = roundTo(b.close * scale, inst.tick)
        minuteBars.push({ instrument_id: inst.id, ts: new Date(Math.floor(b.t / 60) * 60_000), open: close, high: close, low: close, close, volume: 0 })
      }
      dailyBars.push({
        instrument_id: inst.id,
        trade_date: localDay(s.time, s.gmtoffset),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.ltp,
        last_price: q.ltp,
        prev_close: q.prevClose,
        volume: q.volume,
        source: "YAHOO",
      })
    }
    if (quotes.length === 0) throw new Error("Yahoo returned no prices")

    source = nseOpen() ? "DELAYED" : "EOD"
    const changed = quotes.filter((q) => {
      const before = last.get(q.id)
      return !before || before.ltp !== q.ltp || before.volume !== q.volume
    })
    for (const q of quotes) last.set(q.id, q)
    const now = Date.now()
    await valkey
      .multi()
      .hset(KEYS.quotes, Object.fromEntries(quotes.map((q) => [q.id, JSON.stringify(q)])))
      .publish(KEYS.ticks, JSON.stringify(changed))
      .set(KEYS.session, JSON.stringify({ provider: "yahoo", source, startedAt, instruments: quotes.length } satisfies FeedSession))
      .set(KEYS.heartbeat, String(now))
      .exec()

    for (let i = 0; i < minuteBars.length; i += 5000) {
      await db
        .insertInto("md.candle_1m")
        .values(minuteBars.slice(i, i + 5000))
        .onConflict((oc) => oc.columns(["instrument_id", "ts"]).doUpdateSet((eb) => ({ open: eb.ref("excluded.open"), high: eb.ref("excluded.high"), low: eb.ref("excluded.low"), close: eb.ref("excluded.close") })))
        .execute()
    }
    await db
      .insertInto("md.candle_1d")
      .values(dailyBars)
      .onConflict((oc) =>
        oc.columns(["instrument_id", "trade_date"]).doUpdateSet((eb) => ({
          high: eb.ref("excluded.high"),
          low: eb.ref("excluded.low"),
          close: eb.ref("excluded.close"),
          last_price: eb.ref("excluded.last_price"),
          volume: eb.ref("excluded.volume"),
          source: eb.ref("excluded.source"),
        })),
      )
      .execute()
    const stocks = quotes.filter((q) => q.id >= 100 && q.id < 300)
    if (stocks.length) {
      await sql`
        UPDATE scr.equity_snapshot AS es SET price = v.price, change_pct = v.change_pct, price_updated_at = now()
        FROM (VALUES ${sql.join(stocks.map((q) => sql`(${q.id}::bigint, ${q.ltp}::float8, ${q.changePct}::float8)`))}) AS v(id, price, change_pct)
        WHERE es.instrument_id = v.id`.execute(db)
    }
    lastPoll = now
    failures = 0
    return { quotes: quotes.length, changed: changed.length, bars: minuteBars.length }
  }

  const first = await poll()
  log("started", { provider: "yahoo", source, ...first })

  // Healthy while polls keep succeeding at the pace the market calls for.
  const health = createServer((req, res) => {
    const stale = Date.now() - lastPoll > (nseOpen() ? 5 * OPEN_EVERY_MS : 2 * CLOSED_EVERY_MS)
    res.writeHead(req.url === "/health" ? (stale ? 503 : 200) : 404, { "content-type": "application/json" })
    res.end(JSON.stringify({ status: stale ? "stale" : "ok", provider: "yahoo", source, instruments: listed.length, lastPollAgoMs: Date.now() - lastPoll }))
  }).listen(port)

  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    const wait = nseOpen() ? OPEN_EVERY_MS : CLOSED_EVERY_MS
    timer = setTimeout(async () => {
      try {
        const r = await poll()
        log("polled", { source, ...r })
      } catch (err) {
        failures++
        log("poll failed", { error: (err as Error).message, failures })
        // Back off when Yahoo pushes back, up to fifteen minutes.
        await sleep(Math.min(15 * 60_000, 30_000 * 2 ** Math.min(failures, 5)))
      }
      schedule()
    }, wait)
  }
  schedule()

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, async () => {
      clearTimeout(timer)
      health.close()
      await db.destroy()
      valkey.disconnect()
      log("stopped", { signal })
      process.exit(0)
    })
  }
}
