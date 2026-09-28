// Shared pieces for the load scenarios: the instrument universe, latency
// histograms, a tiny Valkey (RESP) client for publishing ticks, and argument parsing.
// Dependency-free, for Node 22+ (global fetch and WebSocket).

import { readFileSync } from "node:fs"
import { createConnection } from "node:net"

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** --key value pairs into an object; --flag alone is true. */
export function args(defaults = {}) {
  const out = { ...defaults }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) continue
    const next = argv[i + 1]
    if (next === undefined || next.startsWith("--")) out[a.slice(2)] = true
    else {
      out[a.slice(2)] = next
      i++
    }
  }
  return out
}

/** "28x120,300x60" → [{ rate: 28, seconds: 120 }, { rate: 300, seconds: 60 }] */
export function stages(spec) {
  return String(spec)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [rate, seconds] = s.split("x").map(Number)
      return { rate, seconds }
    })
}

const slugify = (symbol) =>
  symbol
    .toLowerCase()
    .replace(/&/g, "-and-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/** The test database's instruments, exported to .cache/universe.json by the runbook. */
export function universe(path = new URL("./.cache/universe.json", import.meta.url)) {
  const rows = JSON.parse(readFileSync(path, "utf8"))
  const all = rows.map((r) => ({ ...r, slug: slugify(r.symbol) }))
  return {
    all,
    // Listings below 20000 are companies; ETFs are 20000+, REITs and InvITs 30000+.
    stocks: all.filter((r) => r.kind === "LISTING" && r.id < 20000),
    indices: all.filter((r) => r.kind === "INDEX"),
  }
}

export const pick = (list) => list[Math.floor(Math.random() * list.length)]

export function sample(list, n) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

/** Latencies in milliseconds, kept whole (a run is at most a few hundred thousand samples). */
export class Hist {
  constructor() {
    this.values = []
  }
  add(v) {
    this.values.push(v)
  }
  get count() {
    return this.values.length
  }
  summary() {
    const v = Float64Array.from(this.values).sort()
    const at = (p) => (v.length ? v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))] : null)
    const mean = v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
    return { count: v.length, mean: round(mean), p50: round(at(50)), p90: round(at(90)), p95: round(at(95)), p99: round(at(99)), max: round(v.length ? v[v.length - 1] : null) }
  }
}

export const round = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)

/** A minimal Valkey client: enough RESP to PUBLISH and pipeline commands, without a dependency. */
export class Resp {
  constructor(host = "127.0.0.1", port = 6390) {
    this.host = host
    this.port = port
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.socket = createConnection({ host: this.host, port: this.port }, resolve)
      this.socket.on("error", reject)
      // Replies are read and dropped; the scenarios only write.
      this.socket.on("data", () => {})
    })
  }
  static encode(parts) {
    let out = `*${parts.length}\r\n`
    for (const p of parts) {
      const s = String(p)
      out += `$${Buffer.byteLength(s)}\r\n${s}\r\n`
    }
    return out
  }
  send(...commands) {
    const ok = this.socket.write(commands.map((c) => Resp.encode(c)).join(""))
    return ok ? Promise.resolve() : new Promise((r) => this.socket.once("drain", r))
  }
  close() {
    this.socket?.end()
  }
}

/** A quote shaped like the ingestor's, stamped now. */
export function quote(id, ltp, prevClose, volume = 0) {
  const change = ltp - prevClose
  return {
    id,
    ltp: round(ltp, 2),
    open: prevClose,
    high: round(Math.max(ltp, prevClose), 2),
    low: round(Math.min(ltp, prevClose), 2),
    prevClose,
    change: round(change, 2),
    changePct: round((change / prevClose) * 100, 3),
    volume,
    bid: round(ltp - 0.05, 2),
    ask: round(ltp + 0.05, 2),
    ts: Date.now(),
    tickDir: change >= 0 ? 1 : -1,
  }
}

export function table(rows, columns) {
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)))
  const line = (vals) => vals.map((v, i) => String(v ?? "").padEnd(widths[i])).join("  ")
  return [line(columns), line(widths.map((w) => "-".repeat(w))), ...rows.map((r) => line(columns.map((c) => r[c])))].join("\n")
}
