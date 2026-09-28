// Failover (blueprint §10.2): kill the ingestor in the middle of a run and
// measure how long the stream is silent, then check the 1-minute bars for
// duplicates. The blueprint expects a standby to take over within ~10 s; with
// one ingestor, recovery is whatever a restart takes, so this script plays the
// supervisor: it runs the ingestor, kills it without warning, and starts it again.
//
//   node loadtest/failover.mjs --ws ws://127.0.0.1:4101/v1/stream --db greencircuits_lt --valkey redis://localhost:6390 --kill-after 60 --restart-after 2

import { execFileSync, spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { args, round, sleep, universe } from "./lib.mjs"

const opt = args({ ws: "ws://127.0.0.1:4101/v1/stream", db: "greencircuits_lt", valkey: "redis://localhost:6390", port: 4110, "kill-after": 60, "restart-after": 2, observe: 90, out: "" })
if (opt.db === "greencircuits" && !opt.force) {
  console.error("Refusing to run against the development database: the simulator rewrites recent bars on start. Use a test database, or --force.")
  process.exit(1)
}
const repo = fileURLToPath(new URL("..", import.meta.url))
const psql = (sql) => execFileSync("docker", ["compose", "exec", "-T", "db", "psql", "-U", "greencircuits", "-d", opt.db, "-tAc", sql], { cwd: repo, encoding: "utf8" }).trim()
const env = { ...process.env, DATABASE_URL: `postgres://greencircuits:greencircuits@localhost:55432/${opt.db}`, VALKEY_URL: opt.valkey, PORT: String(opt.port), FEED_PROVIDER: "simulator" }

const startIngestor = () => {
  const child = spawn(process.execPath, [`${repo}/apps/ingestor/node_modules/tsx/dist/cli.mjs`, `${repo}/apps/ingestor/src/main.ts`], { env, cwd: repo, stdio: ["ignore", "pipe", "pipe"] })
  child.stdout.on("data", (d) => {
    for (const line of String(d).split("\n")) if (line.includes('"started"')) console.log(`ingestor: ${line.trim()}`)
  })
  child.stderr.on("data", (d) => process.stderr.write(`ingestor! ${d}`))
  return child
}

// A client following the first 100 instruments: record when each frame lands.
const ids = universe().all.slice(0, 100).map((r) => r.id)
const arrivals = []
const ws = new WebSocket(opt.ws)
ws.addEventListener("open", () => ws.send(JSON.stringify({ op: "sub", ids })))
ws.addEventListener("message", (ev) => {
  const frame = JSON.parse(ev.data)
  if (frame.t === "q") arrivals.push(Date.now())
})

let ingestor = startIngestor()
const bootStart = Date.now()
while (arrivals.length === 0 && Date.now() - bootStart < 120_000) await sleep(100)
const firstBootMs = Date.now() - bootStart
console.log(`stream flowing ${firstBootMs} ms after the ingestor started`)
await sleep(Number(opt["kill-after"]) * 1000)

const killedAt = Date.now()
// No SIGTERM and no chance to flush: a crash, as the container runtime would see it.
if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(ingestor.pid), "/T", "/F"])
else ingestor.kill("SIGKILL")
console.log(`killed the ingestor at ${new Date(killedAt).toISOString()}`)
await sleep(Number(opt["restart-after"]) * 1000)
const restartedAt = Date.now()
ingestor = startIngestor()
while (!arrivals.some((t) => t > restartedAt) && Date.now() - restartedAt < 180_000) await sleep(50)
const resumedAt = arrivals.find((t) => t > restartedAt)
const lastBefore = [...arrivals].reverse().find((t) => t <= killedAt)
await sleep(Number(opt.observe) * 1000)

const window = `ts >= to_timestamp(${Math.floor(killedAt / 1000) - 3600}) AND ts <= now()`
const result = {
  scenario: "failover",
  firstBootMs,
  killedAt: new Date(killedAt).toISOString(),
  restartDelayMs: restartedAt - killedAt,
  silentMs: resumedAt && lastBefore ? resumedAt - lastBefore : null,
  resumeAfterRestartMs: resumedAt ? resumedAt - restartedAt : null,
  duplicateBars: Number(psql(`SELECT count(*) - count(DISTINCT (instrument_id, ts)) FROM md.candle_1m WHERE ${window}`)),
  barsInLastHour: Number(psql(`SELECT count(*) FROM md.candle_1m WHERE ${window}`)),
  framesAfterRestartPerSecond: round(arrivals.filter((t) => t > (resumedAt ?? Infinity)).length / Number(opt.observe), 1),
}
console.log(JSON.stringify(result, null, 2))
if (opt.out) {
  mkdirSync(dirname(opt.out), { recursive: true })
  writeFileSync(opt.out, JSON.stringify(result, null, 2))
}
ws.close()
if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(ingestor.pid), "/T", "/F"])
else ingestor.kill("SIGTERM")
process.exit(0)
