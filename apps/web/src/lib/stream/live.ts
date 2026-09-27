"use client"

import { fromWire, type ServerFrame } from "@greencircuits/contracts"
import type { Quote } from "@greencircuits/market/types"
import { quoteStore } from "./store"

let started = false

/**
 * Connect to the stream gateway and feed its frames into the quote store.
 * Reconnects with capped, jittered exponential backoff; the store keeps the
 * last values meanwhile, so the page stays readable while the status says
 * "connecting".
 */
export function connectLive(url: string, initial: Map<number, Quote>): void {
  if (started) return
  started = true
  quoteStore.apply([...initial.values()])
  quoteStore.setStatus("connecting")
  const ids = [...initial.keys()]
  let attempt = 0

  const open = () => {
    const ws = new WebSocket(url)
    ws.onopen = () => {
      attempt = 0
      ws.send(JSON.stringify({ op: "sub", ids }))
    }
    ws.onmessage = (event: MessageEvent<string>) => {
      const frame = JSON.parse(event.data) as ServerFrame
      if (frame.t !== "q") return
      quoteStore.apply(frame.q.map((w) => fromWire(w, quoteStore.get(w[0]))))
      if (quoteStore.status !== "live") quoteStore.setStatus("live")
    }
    ws.onclose = () => {
      quoteStore.setStatus("connecting")
      const delay = Math.min(30_000, 500 * 2 ** attempt++) * (0.75 + Math.random() * 0.5)
      setTimeout(open, delay)
    }
  }
  open()
}
