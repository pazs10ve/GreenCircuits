/// <reference lib="webworker" />
import { createEngine, FLUSH_MS } from "@greencircuits/market/engine"

/**
 * Runs the market simulator off the main thread, the way the real stream
 * gateway will: a snapshot first, then one batch of changed quotes per flush.
 */

type InMessage = { type: "start"; seed: number; startedAt: number } | { type: "pause" } | { type: "resume" }

let timer: ReturnType<typeof setInterval> | undefined
let engine: ReturnType<typeof createEngine> | undefined

function run() {
  if (!engine || timer) return
  timer = setInterval(() => {
    const quotes = engine!.step()
    if (quotes.length) postMessage({ type: "batch", quotes })
  }, FLUSH_MS)
}

self.onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data
  if (msg.type === "start") {
    engine = createEngine(msg.seed, msg.startedAt)
    postMessage({ type: "snapshot", quotes: engine.snapshot() })
    run()
  } else if (msg.type === "pause") {
    if (timer) clearInterval(timer)
    timer = undefined
  } else if (msg.type === "resume") {
    run()
  }
}
