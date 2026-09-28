// Backtest burst (blueprint §10.2): 50 runs submitted at once, each a
// different test so none is served from the result cache, then the wait
// between queueing and a worker starting each one.
//
//   node loadtest/backtests.mjs --base http://127.0.0.1:4100 --db greencircuits_lt --runs 50

import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { Hist, args, round, sleep, universe } from "./lib.mjs"

const opt = args({ base: "http://127.0.0.1:4100", db: "greencircuits_lt", runs: 50, out: "", wait: 900 })
if (opt.db === "greencircuits" && !opt.force) {
  console.error("Refusing to run against the development database. Use a test database, or --force.")
  process.exit(1)
}
const repo = new URL("..", import.meta.url)
const psql = (sql) => execFileSync("docker", ["compose", "exec", "-T", "db", "psql", "-U", "greencircuits", "-d", opt.db, "-tAc", sql], { cwd: repo, encoding: "utf8" }).trim()

// One visitor submits them all; the first write earns the session cookie.
let cookie = ""
const call = async (method, path, body) => {
  const res = await fetch(opt.base + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length && !cookie) cookie = set.map((c) => c.split(";")[0]).join("; ")
  return { status: res.status, body: await res.json().catch(() => null) }
}
await call("PUT", "/v1/me/watchlists", { lists: [] })

// Four in five are single-stock SIPs (about 0.2 s each); one in five trades rules over a
// 50-stock universe, the largest the lab accepts, which is where the time goes.
const all = universe().stocks
const runs = Number(opt.runs)
const definitionOf = (i) =>
  i % 5 === 4
    ? {
        type: "rules",
        universe: all.slice((i * 7) % (all.length - 50), ((i * 7) % (all.length - 50)) + 50).map((s) => s.id),
        entry: [{ left: { kind: "sma", period: 20 + i }, op: "crosses_above", right: { kind: "sma", period: 100 } }],
        exit: { stopPct: 8, targetPct: 20 },
        maxPositions: 10,
      }
    : { type: "sip", instrumentId: all[i % all.length].id, monthly: 10000 + i }
const submittedAt = Date.now()
const submitted = await Promise.all(
  Array.from({ length: runs }, (_, i) =>
    call("POST", "/v1/me/backtests", { name: `Load test ${i + 1}`, definition: definitionOf(i), from: "2016-01-01", to: "2026-09-25" }),
  ),
)
const accepted = submitted.filter((r) => r.status === 202 || r.status === 200)
console.log(`submitted ${submitted.length} in ${Date.now() - submittedAt} ms: ${accepted.length} accepted, statuses ${[...new Set(submitted.map((r) => r.status))].join(", ")}`)
if (accepted.length === 0) console.log(JSON.stringify(submitted[0]?.body))

const cachedResults = accepted.filter((r) => r.body?.cached).length
const runIds = accepted.filter((r) => !r.body?.cached).map((r) => r.body?.runId).filter(Boolean)
const list = runIds.map((id) => `'${id}'`).join(",")
let rows = []
for (let t = 0; t < Number(opt.wait); t += 5) {
  rows = JSON.parse(
    psql(
      `SELECT coalesce(json_agg(json_build_object('status', status, 'wait', extract(epoch FROM started_at - queued_at), 'run', extract(epoch FROM finished_at - started_at), 'total', extract(epoch FROM finished_at - queued_at))), '[]') FROM lab.backtest_run WHERE id IN (${list || "NULL"})`,
    ),
  )
  const done = rows.filter((r) => r.status === "SUCCEEDED" || r.status === "FAILED").length
  if (done === runIds.length) break
  if (t % 30 === 0) console.log(`${done}/${runIds.length} done`)
  await sleep(5000)
}

const wait = new Hist()
const run = new Hist()
const total = new Hist()
for (const r of rows) {
  if (r.wait != null) wait.add(r.wait * 1000)
  if (r.run != null) run.add(r.run * 1000)
  if (r.total != null) total.add(r.total * 1000)
}
const result = {
  scenario: "backtest-burst",
  submitted: submitted.length,
  accepted: accepted.length,
  servedFromCache: cachedResults,
  runs: runIds.length,
  succeeded: rows.filter((r) => r.status === "SUCCEEDED").length,
  failed: rows.filter((r) => r.status === "FAILED").length,
  queueWaitSeconds: Object.fromEntries(Object.entries(wait.summary()).map(([k, v]) => [k, k === "count" ? v : round(v / 1000, 1)])),
  runSeconds: Object.fromEntries(Object.entries(run.summary()).map(([k, v]) => [k, k === "count" ? v : round(v / 1000, 1)])),
  totalSeconds: Object.fromEntries(Object.entries(total.summary()).map(([k, v]) => [k, k === "count" ? v : round(v / 1000, 1)])),
}
console.log(JSON.stringify(result, null, 2))
if (opt.out) {
  mkdirSync(dirname(opt.out), { recursive: true })
  writeFileSync(opt.out, JSON.stringify(result, null, 2))
}
