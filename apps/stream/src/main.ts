import { createRequire } from "node:module"
import type * as UWS from "uWebSockets.js"
import { Redis } from "ioredis"
import { KEYS, MAX_SUBSCRIPTIONS, toWire, type ClientFrame, type ServerFrame, type WireQuote } from "@greencircuits/contracts"
import type { Quote } from "@greencircuits/market/types"

/**
 * The stream gateway. The ingestor publishes each flush's changed quotes to
 * Valkey; the gateway sends every client one frame per flush holding only the
 * instruments that client follows. A client that falls behind (its socket
 * buffer is full) stops receiving frames and gets the latest values of what
 * it missed once the buffer drains, so it never sees stale prices.
 */

// uWebSockets.js v20.71's ESM wrapper imports a file the package doesn't ship; its CommonJS entry works.
const uWS = createRequire(import.meta.url)("uWebSockets.js") as typeof UWS

interface Client {
  subs: Set<number>
  /** Instruments that changed while the socket was backed up. */
  missed: Set<number>
}

const PORT = Number(process.env.PORT ?? 4001)
const VALKEY_URL = process.env.VALKEY_URL ?? "redis://localhost:6380"
const ORIGINS = new Set((process.env.WEB_ORIGINS ?? "http://localhost:3100,http://localhost:3000").split(",").map((o) => o.trim()))
/** Stop sending to a socket with more than this many bytes queued. */
const BACKPRESSURE_LIMIT = 256 * 1024

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), svc: "stream", msg, ...extra }))

const clients = new Set<UWS.WebSocket<Client>>()
const latest = new Map<number, Quote>()
let framesSent = 0
let framesDropped = 0

function send(ws: UWS.WebSocket<Client>, frame: ServerFrame): boolean {
  const status = ws.send(JSON.stringify(frame), false, frame.t === "q")
  if (status === 1) framesSent++
  return status !== 2
}

function snapshotOf(ids: Iterable<number>): WireQuote[] {
  const rows: WireQuote[] = []
  for (const id of ids) {
    const q = latest.get(id)
    if (q) rows.push(toWire(q))
  }
  return rows
}

async function main() {
  const valkey = new Redis(VALKEY_URL)
  const subscriber = new Redis(VALKEY_URL)
  for (const [id, v] of Object.entries(await valkey.hgetall(KEYS.quotes))) latest.set(Number(id), JSON.parse(v) as Quote)

  await subscriber.subscribe(KEYS.ticks)
  subscriber.on("message", (_channel, message) => {
    const quotes = JSON.parse(message) as Quote[]
    for (const q of quotes) latest.set(q.id, q)
    for (const ws of clients) {
      const data = ws.getUserData()
      if (data.subs.size === 0) continue
      const rows: WireQuote[] = []
      for (const q of quotes) if (data.subs.has(q.id)) rows.push(toWire(q))
      if (rows.length === 0) continue
      if (ws.getBufferedAmount() > BACKPRESSURE_LIMIT) {
        for (const r of rows) data.missed.add(r[0])
        framesDropped++
        continue
      }
      send(ws, { t: "q", q: rows })
    }
  })

  const app = uWS.App()
  app.ws<Client>("/v1/stream", {
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024,
    idleTimeout: 120,
    maxBackpressure: 4 * BACKPRESSURE_LIMIT,

    upgrade: (res, req, context) => {
      const origin = req.getHeader("origin")
      // Browsers always send Origin; refuse pages we don't serve. Non-browser clients (load tests) send none.
      if (origin && !ORIGINS.has(origin)) {
        res.writeStatus("403 Forbidden").end("origin not allowed")
        return
      }
      res.upgrade<Client>(
        { subs: new Set(), missed: new Set() },
        req.getHeader("sec-websocket-key"),
        req.getHeader("sec-websocket-protocol"),
        req.getHeader("sec-websocket-extensions"),
        context,
      )
    },

    open: (ws) => {
      clients.add(ws)
      send(ws, { t: "hello", source: "SIMULATED", flushMs: 250 })
    },

    message: (ws, message) => {
      let frame: ClientFrame
      try {
        frame = JSON.parse(Buffer.from(message).toString("utf8")) as ClientFrame
      } catch {
        send(ws, { t: "error", message: "Frames are JSON." })
        return
      }
      const data = ws.getUserData()
      if (frame.op === "ping") {
        send(ws, { t: "pong" })
      } else if (frame.op === "sub" && Array.isArray(frame.ids)) {
        const fresh: number[] = []
        for (const id of frame.ids) {
          if (!Number.isInteger(id) || data.subs.has(id)) continue
          if (data.subs.size >= MAX_SUBSCRIPTIONS) break
          data.subs.add(id)
          fresh.push(id)
        }
        // New subscribers get the current value at once instead of waiting for the next tick.
        const rows = snapshotOf(fresh)
        if (rows.length) send(ws, { t: "q", q: rows })
      } else if (frame.op === "unsub" && Array.isArray(frame.ids)) {
        for (const id of frame.ids) data.subs.delete(id)
      } else {
        send(ws, { t: "error", message: "Unknown op." })
      }
    },

    drain: (ws) => {
      const data = ws.getUserData()
      if (data.missed.size === 0 || ws.getBufferedAmount() > BACKPRESSURE_LIMIT) return
      const rows = snapshotOf(data.missed)
      data.missed.clear()
      if (rows.length) send(ws, { t: "q", q: rows })
    },

    close: (ws) => {
      clients.delete(ws)
    },
  })

  app.get("/health", (res) => {
    res.writeHeader("content-type", "application/json").end(JSON.stringify({ status: "ok", clients: clients.size, instruments: latest.size }))
  })
  app.any("/*", (res) => {
    res.writeStatus("404 Not Found").end()
  })

  app.listen(PORT, (token) => {
    if (!token) {
      log("could not listen", { port: PORT })
      process.exit(1)
    }
    log("listening", { port: PORT, instruments: latest.size })
  })

  setInterval(() => {
    log("stats", { clients: clients.size, framesSent, framesDropped })
    framesSent = 0
    framesDropped = 0
  }, 60_000)

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      for (const ws of clients) ws.end(1001, "server restarting")
      subscriber.disconnect()
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
