// Alerts (blueprint §10.2): 50,000 active alerts, a price spike that crosses
// all of them while the feed runs, and a check that each fired exactly once:
// one trigger, one notification, one delivery, and none for alerts the spike
// never reached. Run it with two alert engines up to test the claim that a
// conditional update keeps firing exactly once across engines.
//
// Only for a test database: it creates 500 users and 55,000 alerts.
//
//   node loadtest/alerts.mjs --db greencircuits_lt --valkey 127.0.0.1:6390 --engines http://127.0.0.1:4111,http://127.0.0.1:4112

import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { Resp, args, quote, round, sleep, universe } from "./lib.mjs"

const opt = args({ db: "greencircuits_lt", valkey: "127.0.0.1:6390", engines: "http://127.0.0.1:4111", instruments: 500, "per-instrument": 100, control: 5000, out: "", wait: 300 })
if (opt.db === "greencircuits" && !opt.force) {
  console.error("Refusing to run against the development database. Use a test database, or --force.")
  process.exit(1)
}
const repo = new URL("..", import.meta.url)
const psql = (sql) => execFileSync("docker", ["compose", "exec", "-T", "db", "psql", "-U", "greencircuits", "-d", opt.db, "-v", "ON_ERROR_STOP=1", "-tAc", sql], { cwd: repo, encoding: "utf8" }).trim()
const engines = String(opt.engines).split(",")
const health = async () => Promise.all(engines.map(async (e) => (await (await fetch(`${e}/health`)).json())))

const ids = universe().stocks.slice(0, Number(opt.instruments)).map((s) => s.id)
const PER = Number(opt["per-instrument"])
const expected = ids.length * PER
const idList = ids.join(",")

console.log(`setting up ${expected} alerts on ${ids.length} instruments, plus ${opt.control} that the spike never reaches`)
psql(`DELETE FROM app.users WHERE name = 'loadtest'`)
psql(`INSERT INTO app.users (name, is_anonymous) SELECT 'loadtest', true FROM generate_series(1, 500)`)
psql(`
  WITH u AS (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM app.users WHERE name = 'loadtest'),
       i AS (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM ref.instrument WHERE id IN (${idList}))
  INSERT INTO app.alert (user_id, kind, instrument_id, threshold, channels, note)
  SELECT u.id, 'PRICE_ABOVE', i.id, 1050, '{IN_APP}', 'loadtest'
  FROM i CROSS JOIN generate_series(1, ${PER}) AS g JOIN u ON u.rn = ((i.rn * ${PER} + g) % 500) + 1`)
psql(`
  WITH u AS (SELECT id FROM app.users WHERE name = 'loadtest' LIMIT 1)
  INSERT INTO app.alert (user_id, kind, instrument_id, threshold, channels, note)
  SELECT u.id, 'PRICE_ABOVE', (ARRAY[${idList}])[1 + (g % ${ids.length})], 5000, '{IN_APP}', 'loadtest-control'
  FROM u CROSS JOIN generate_series(1, ${Number(opt.control)}) AS g`)

const [host, port] = String(opt.valkey).split(":")
const valkey = new Resp(host, Number(port))
await valkey.connect()
await valkey.send(["PUBLISH", "gc:alerts:changed", "{}"])
const want = expected + Number(opt.control)
for (let t = 0; t < 120; t++) {
  const h = await health()
  if (h.every((x) => x.active >= want)) break
  await sleep(1000)
}
const before = await health()
console.log(`engines loaded: ${before.map((h) => h.active).join(", ")} active`)

// Quiet ticks under the levels, then one spike through them, then ticks above them for a while
// (each is a fresh chance to fire twice), a dip, and a second spike.
const publish = (price) => valkey.send(["PUBLISH", "gc:ticks", JSON.stringify(ids.map((id) => quote(id, price * (1 + (Math.random() - 0.5) * 0.002), 1000)))])
for (let k = 0; k < 20; k++) {
  await publish(1000)
  await sleep(250)
}
const spikeAt = Date.now()
console.log(`spike at ${new Date(spikeAt).toISOString()}`)
for (let k = 0; k < 80; k++) {
  await publish(1100)
  await sleep(250)
}
for (let k = 0; k < 12; k++) {
  await publish(1000)
  await sleep(250)
}
for (let k = 0; k < 40; k++) {
  await publish(1100)
  await sleep(250)
}

// Wait for the engines to settle: fired counts stop changing.
let last = -1
let stable = 0
for (let t = 0; t < Number(opt.wait); t++) {
  const done = Number(psql(`SELECT count(*) FROM app.alert WHERE note = 'loadtest' AND status = 'TRIGGERED'`))
  if (done === last) stable++
  else stable = 0
  last = done
  if (done >= expected && stable >= 5) break
  if (stable >= 30) break
  await sleep(1000)
}
valkey.close()

const q = (sql) => Number(psql(sql))
const result = {
  scenario: "alerts",
  engines: engines.length,
  alerts: expected,
  control: Number(opt.control),
  triggered: q(`SELECT count(*) FROM app.alert WHERE note = 'loadtest' AND status = 'TRIGGERED'`),
  stillActive: q(`SELECT count(*) FROM app.alert WHERE note = 'loadtest' AND status = 'ACTIVE'`),
  triggers: q(`SELECT count(*) FROM app.alert_trigger t JOIN app.alert a ON a.id = t.alert_id WHERE a.note = 'loadtest'`),
  alertsTriggeredTwiceOrMore: q(`SELECT count(*) FROM (SELECT t.alert_id FROM app.alert_trigger t JOIN app.alert a ON a.id = t.alert_id WHERE a.note = 'loadtest' GROUP BY t.alert_id HAVING count(*) > 1) x`),
  triggerCountAboveOne: q(`SELECT count(*) FROM app.alert WHERE note = 'loadtest' AND trigger_count > 1`),
  notifications: q(`SELECT count(*) FROM app.notification n JOIN app.users u ON u.id = n.user_id WHERE u.name = 'loadtest' AND n.kind = 'ALERT'`),
  deliveriesSent: q(`SELECT count(*) FROM app.notification_delivery d JOIN app.notification n ON n.id = d.notification_id JOIN app.users u ON u.id = n.user_id WHERE u.name = 'loadtest' AND d.status = 'SENT'`),
  controlFired: q(`SELECT count(*) FROM app.alert WHERE note = 'loadtest-control' AND status <> 'ACTIVE'`),
  firstFireMs: q(`SELECT round(extract(epoch FROM min(t.triggered_at)) * 1000 - ${spikeAt}) FROM app.alert_trigger t JOIN app.alert a ON a.id = t.alert_id WHERE a.note = 'loadtest'`),
  lastFireMs: q(`SELECT round(extract(epoch FROM max(t.triggered_at)) * 1000 - ${spikeAt}) FROM app.alert_trigger t JOIN app.alert a ON a.id = t.alert_id WHERE a.note = 'loadtest'`),
  firedByEngine: (await health()).map((h, i) => h.fired - before[i].fired),
}
result.exactlyOnce = result.triggered === expected && result.triggers === expected && result.alertsTriggeredTwiceOrMore === 0 && result.notifications === expected && result.deliveriesSent === expected && result.controlFired === 0
result.firesPerSecond = round(expected / Math.max(1, result.lastFireMs / 1000))
console.log(JSON.stringify(result, null, 2))
if (opt.out) {
  mkdirSync(dirname(opt.out), { recursive: true })
  writeFileSync(opt.out, JSON.stringify(result, null, 2))
}
