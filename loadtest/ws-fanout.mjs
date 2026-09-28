// WebSocket fan-out (blueprint §10.2): ramp to each client count in turn, each
// client subscribed to 100 instruments, and measure tick lag: when a quote
// reaches the client, less the time stamped on it at publication. Frames carry
// that time (ADR 0004), so lag covers the gateway, the network and the client.
//
//   node loadtest/ws-fanout.mjs --url ws://127.0.0.1:4101/v1/stream --stages 1000x180,3000x180 --subs 100 --base-id 900000 --instruments 25000

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { Hist, args, round, sleep, stages } from "./lib.mjs"

const opt = args({ url: "ws://127.0.0.1:4101/v1/stream", stages: "1000x120", subs: 100, "base-id": 900000, instruments: 25000, ramp: 200, out: "", settle: 10 })
const plan = stages(opt.stages)
const SUBS = Number(opt.subs)
const baseId = Number(opt["base-id"])
const N = Number(opt.instruments)

const clients = []
let opened = 0
let errors = 0
let closedUnexpectedly = 0
let measuring = null

function connect() {
  return new Promise((resolve) => {
    const ws = new WebSocket(opt.url)
    const c = { ws, frames: 0, quotes: 0, bytes: 0 }
    ws.addEventListener("open", () => {
      opened++
      const start = Math.floor(Math.random() * N)
      const ids = Array.from({ length: SUBS }, (_, k) => baseId + ((start + k * Math.floor(N / SUBS)) % N))
      ws.send(JSON.stringify({ op: "sub", ids }))
      resolve(c)
    })
    ws.addEventListener("message", (ev) => {
      const now = Date.now()
      const text = typeof ev.data === "string" ? ev.data : ""
      c.bytes += text.length
      if (!measuring) return
      const frame = JSON.parse(text)
      if (frame.t !== "q") return
      c.frames++
      measuring.frames++
      for (const row of frame.q) {
        // row = [id, ltp, open, high, low, prevClose, volume, time]
        measuring.lag.add(now - row[7])
        measuring.quotes++
      }
    })
    ws.addEventListener("error", () => {
      errors++
      resolve(c)
    })
    ws.addEventListener("close", () => {
      if (!c.closing) closedUnexpectedly++
    })
    clients.push(c)
  })
}

const results = []
for (const [i, st] of plan.entries()) {
  const target = st.rate
  const rampStart = Date.now()
  // Ramp up in steps of --ramp clients a second.
  while (clients.length < target) {
    const batch = Math.min(Number(opt.ramp), target - clients.length)
    await Promise.all(Array.from({ length: batch }, connect))
    await sleep(1000)
  }
  const rampSeconds = (Date.now() - rampStart) / 1000
  await sleep(Number(opt.settle) * 1000)
  measuring = { lag: new Hist(), frames: 0, quotes: 0 }
  const bytesBefore = clients.reduce((s, c) => s + c.bytes, 0)
  const t0 = Date.now()
  await sleep(st.seconds * 1000)
  const window = (Date.now() - t0) / 1000
  const lag = measuring.lag.summary()
  const bytes = clients.reduce((s, c) => s + c.bytes, 0) - bytesBefore
  const open = clients.filter((c) => c.ws.readyState === WebSocket.OPEN).length
  const starved = clients.filter((c) => c.ws.readyState === WebSocket.OPEN && c.frames === 0).length
  const r = {
    stage: i + 1,
    clients: target,
    openSockets: open,
    rampSeconds: round(rampSeconds),
    measuredSeconds: round(window),
    framesPerSecond: round(measuring.frames / window),
    quotesPerSecond: round(measuring.quotes / window),
    mbPerSecondIn: round(bytes / window / 1e6, 2),
    lagMs: lag,
    socketErrors: errors,
    closedUnexpectedly,
    clientsWithNoFrames: starved,
  }
  results.push(r)
  console.log(
    `stage ${r.stage}: ${r.openSockets}/${r.clients} open, ${r.framesPerSecond} frames/s, ${r.quotesPerSecond} quotes/s, ${r.mbPerSecondIn} MB/s, lag p50 ${lag.p50} p95 ${lag.p95} p99 ${lag.p99} max ${lag.max} ms, errors ${errors}, closed ${closedUnexpectedly}`,
  )
  for (const c of clients) c.frames = 0
  measuring = null
}

for (const c of clients) {
  c.closing = true
  c.ws.close()
}
if (opt.out) {
  mkdirSync(dirname(opt.out), { recursive: true })
  writeFileSync(opt.out, JSON.stringify({ scenario: "ws-fanout", url: opt.url, subs: SUBS, stages: results }, null, 2))
  console.log(`wrote ${opt.out}`)
}
await sleep(500)
process.exit(0)
