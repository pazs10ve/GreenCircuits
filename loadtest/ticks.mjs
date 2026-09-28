// A synthetic feed at the blueprint's load-test rate: 20,000 ticks a second
// across 5,000 stocks and 20,000 option contracts, published on gc:ticks every
// 250 ms exactly as the ingestor publishes them. Point it only at a test Valkey:
// every consumer of gc:ticks (the gateway, the alert engine) will act on it.
//
//   node loadtest/ticks.mjs --valkey 127.0.0.1:6390 --rate 20000 --instruments 25000 --base-id 900000 --seconds 600

import { Resp, args, quote, sleep } from "./lib.mjs"

const opt = args({ valkey: "127.0.0.1:6390", rate: 20000, instruments: 25000, "base-id": 900000, seconds: 600, flush: 250 })
const [host, port] = String(opt.valkey).split(":")
if (Number(port) === 6380 && !opt.force) {
  console.error("Refusing to publish synthetic ticks on 6380, the development Valkey: its alert engine would act on them. Use the test Valkey, or --force.")
  process.exit(1)
}

const N = Number(opt.instruments)
const baseId = Number(opt["base-id"])
const perFlush = Math.round((Number(opt.rate) * Number(opt.flush)) / 1000)
// Each synthetic instrument walks from its own starting price.
const prev = Float64Array.from({ length: N }, (_, i) => 100 + ((i * 37) % 4900))
const last = Float64Array.from(prev)

const valkey = new Resp(host, Number(port))
await valkey.connect()
console.log(`publishing ${perFlush} quotes every ${opt.flush} ms (${opt.rate}/s) over ${N} instruments from id ${baseId}, for ${opt.seconds}s`)

const end = Date.now() + Number(opt.seconds) * 1000
let flushes = 0
let cursor = 0
let late = 0
let next = Date.now()
while (Date.now() < end) {
  const batch = []
  // Walk through the instruments so each changes about equally often.
  for (let k = 0; k < perFlush; k++) {
    const i = cursor
    cursor = (cursor + 1) % N
    last[i] = Math.max(1, last[i] * (1 + (Math.random() - 0.5) * 0.002))
    batch.push(quote(baseId + i, last[i], prev[i]))
  }
  await valkey.send(["PUBLISH", "gc:ticks", JSON.stringify(batch)])
  flushes++
  next += Number(opt.flush)
  const wait = next - Date.now()
  if (wait > 0) await sleep(wait)
  else late++
  if (flushes % 240 === 0) console.log(`${new Date().toISOString()} flushes ${flushes}, late ${late}`)
}
valkey.close()
console.log(`done: ${flushes} flushes, ${flushes * perFlush} ticks, ${late} late`)
