// HTTP mix (blueprint §10.2): an open-loop request rate in stages, with the
// blueprint's mix of reads and writes, reporting p50/p95/p99 per class and the
// error rate. Open loop means requests go out on schedule whether or not earlier
// ones have answered, so a slow server shows up as latency, not as a lower rate.
//
//   node loadtest/http-mix.mjs --base http://127.0.0.1:4100 --plan 28x600,300x60,28x300 --out loadtest/results/http.json

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { Hist, args, pick, round, sample, sleep, stages, table, universe } from "./lib.mjs"

const opt = args({ base: "http://127.0.0.1:4100", plan: "28x60", out: "", inflight: 4000, timeout: 10000 })
const plan = stages(opt.plan)
const { stocks, indices } = universe()

// Writers keep the session cookie their first write earns, like returning visitors.
const writers = Array.from({ length: 200 }, () => ({ cookie: null }))

// The blueprint's mix: 40% quotes, 20% bars, 15% instrument pages, 10% chains, 10% screener, 5% writes.
// Option chains are computed in the browser, so their 10% goes to what an index page asks the API for.
// "cached" marks reads the API serves from Valkey (quotes always; pages, screener and overviews after the first).
const MIX = [
  { cls: "quotes", cached: true, w: 30, make: () => ({ path: `/v1/quotes?ids=${sample(stocks, 20).map((s) => s.id).join(",")}` }) },
  { cls: "quotes-snapshot", cached: true, w: 10, make: () => ({ path: "/v1/quotes/snapshot" }) },
  { cls: "bars-daily", cached: false, w: 15, make: () => ({ path: `/v1/instruments/${pick(stocks).id}/candles?sessions=250` }) },
  { cls: "bars-intraday", cached: false, w: 5, make: () => ({ path: `/v1/instruments/${pick(stocks).id}/intraday?minutes=5` }) },
  { cls: "company", cached: true, w: 10, make: () => ({ path: `/v1/companies/${pick(stocks).slug}` }) },
  { cls: "instrument", cached: false, w: 5, make: () => ({ path: `/v1/instruments/${pick(stocks).slug}` }) },
  { cls: "index-overview", cached: true, w: 5, make: () => ({ path: `/v1/market/overview/${pick(indices).slug}` }) },
  { cls: "index-intraday", cached: false, w: 5, make: () => ({ path: `/v1/instruments/${pick(indices).id}/intraday?minutes=5` }) },
  { cls: "screener", cached: true, w: 10, make: () => ({ path: "/v1/screener/rows" }) },
  {
    cls: "write-watchlist",
    cached: false,
    w: 4,
    make: () => ({ method: "PUT", path: "/v1/me/watchlists", writer: pick(writers), body: { lists: [{ name: "Load test", ids: sample(stocks, 10).map((s) => s.id) }] } }),
  },
  {
    cls: "write-alert",
    cached: false,
    w: 1,
    // A level no price reaches: the alert is stored and loaded, never fired.
    make: () => ({ method: "POST", path: "/v1/me/alerts", writer: pick(writers), body: { instrumentId: pick(stocks).id, condition: "PRICE_ABOVE", value: 1e9, channels: ["IN_APP"] } }),
  },
]
const totalWeight = MIX.reduce((s, m) => s + m.w, 0)
function choose() {
  let r = Math.random() * totalWeight
  for (const m of MIX) if ((r -= m.w) < 0) return m
  return MIX[0]
}

let inflight = 0
async function send(stage, entry) {
  const req = entry.make()
  const headers = { accept: "application/json" }
  if (req.body) headers["content-type"] = "application/json"
  if (req.writer?.cookie) headers.cookie = req.writer.cookie
  const t0 = performance.now()
  inflight++
  try {
    const res = await fetch(opt.base + req.path, { method: req.method ?? "GET", headers, body: req.body ? JSON.stringify(req.body) : undefined, signal: AbortSignal.timeout(Number(opt.timeout)) })
    await res.arrayBuffer()
    const ms = performance.now() - t0
    if (req.writer && !req.writer.cookie) {
      const set = res.headers.getSetCookie?.() ?? []
      if (set.length) req.writer.cookie = set.map((c) => c.split(";")[0]).join("; ")
    }
    stage.record(entry, ms, res.status)
  } catch (err) {
    stage.record(entry, performance.now() - t0, err.name === "TimeoutError" ? "timeout" : "neterr")
  } finally {
    inflight--
  }
}

class Stage {
  constructor(rate, seconds, index) {
    Object.assign(this, { rate, seconds, index, sent: 0, skipped: 0 })
    this.byClass = new Map()
    this.all = new Hist()
    this.cached = new Hist()
    this.uncached = new Hist()
    this.errors = new Map()
  }
  record(entry, ms, status) {
    const ok = typeof status === "number" && status >= 200 && status < 300
    if (!this.byClass.has(entry.cls)) this.byClass.set(entry.cls, { hist: new Hist(), errors: 0 })
    const c = this.byClass.get(entry.cls)
    if (ok) {
      c.hist.add(ms)
      this.all.add(ms)
      ;(entry.cached ? this.cached : this.uncached).add(ms)
    } else {
      c.errors++
      this.errors.set(String(status), (this.errors.get(String(status)) ?? 0) + 1)
    }
  }
  report() {
    const errorCount = [...this.errors.values()].reduce((s, n) => s + n, 0)
    return {
      stage: this.index + 1,
      targetRps: this.rate,
      seconds: this.seconds,
      sent: this.sent,
      achievedRps: round(this.sent / this.seconds),
      skippedAtInflightCap: this.skipped,
      errors: errorCount,
      errorRatePct: round((errorCount / Math.max(1, this.sent)) * 100, 3),
      errorsByStatus: Object.fromEntries(this.errors),
      all: this.all.summary(),
      cached: this.cached.summary(),
      uncached: this.uncached.summary(),
      byClass: Object.fromEntries([...this.byClass].map(([cls, c]) => [cls, { ...c.hist.summary(), errors: c.errors }])),
    }
  }
}

const results = []
const started = new Date().toISOString()
for (const [i, st] of plan.entries()) {
  const stage = new Stage(st.rate, st.seconds, i)
  const t0 = performance.now()
  const end = t0 + st.seconds * 1000
  const pending = []
  while (performance.now() < end) {
    const due = Math.floor(((performance.now() - t0) / 1000) * st.rate)
    while (stage.sent < due) {
      stage.sent++
      if (inflight >= Number(opt.inflight)) {
        stage.skipped++
        stage.record({ cls: "skipped", cached: false }, 0, "inflight-cap")
        continue
      }
      pending.push(send(stage, choose()))
    }
    await sleep(2)
  }
  await Promise.allSettled(pending)
  const r = stage.report()
  results.push(r)
  console.log(
    `stage ${r.stage}: ${r.targetRps} rps x ${r.seconds}s → sent ${r.sent} (${r.achievedRps} rps), errors ${r.errors} (${r.errorRatePct}%), p95 all ${r.all.p95} ms, cached ${r.cached.p95} ms, uncached ${r.uncached.p95} ms`,
  )
}

const rows = results.flatMap((r) =>
  Object.entries(r.byClass).map(([cls, s]) => ({ stage: r.stage, rps: r.targetRps, class: cls, n: s.count, p50: s.p50, p95: s.p95, p99: s.p99, max: s.max, errors: s.errors })),
)
console.log("\n" + table(rows, ["stage", "rps", "class", "n", "p50", "p95", "p99", "max", "errors"]))

if (opt.out) {
  mkdirSync(dirname(opt.out), { recursive: true })
  writeFileSync(opt.out, JSON.stringify({ scenario: "http-mix", base: opt.base, plan: opt.plan, started, finished: new Date().toISOString(), stages: results }, null, 2))
  console.log(`\nwrote ${opt.out}`)
}
