import type { Quote } from "@greencircuits/market/types"

export type AlertKind = "PRICE_ABOVE" | "PRICE_BELOW" | "CHANGE_PCT_ABOVE" | "CHANGE_PCT_BELOW"

export interface LiveAlert {
  id: string
  version: number
  userId: string
  instrumentId: number
  kind: AlertKind
  threshold: number
  repeat: boolean
  cooldownMs: number
  /** Unix ms of the last firing, if any. */
  lastTriggeredAt: number | null
  note: string | null
}

export function isMet(a: Pick<LiveAlert, "kind" | "threshold">, q: Pick<Quote, "ltp" | "changePct">): boolean {
  switch (a.kind) {
    case "PRICE_ABOVE":
      return q.ltp >= a.threshold
    case "PRICE_BELOW":
      return q.ltp <= a.threshold
    case "CHANGE_PCT_ABOVE":
      return q.changePct >= a.threshold
    case "CHANGE_PCT_BELOW":
      return q.changePct <= a.threshold
  }
}

/**
 * Active alerts indexed by instrument, so each tick only looks at the alerts
 * on the instruments that moved. The database stays the source of truth:
 * a firing is only real once the conditional update in Postgres succeeds.
 */
export class AlertBook {
  private byInstrument = new Map<number, LiveAlert[]>()
  private inFlight = new Set<string>()

  load(alerts: LiveAlert[]): void {
    this.byInstrument.clear()
    for (const a of alerts) {
      const list = this.byInstrument.get(a.instrumentId) ?? []
      list.push(a)
      this.byInstrument.set(a.instrumentId, list)
    }
  }

  get size(): number {
    let n = 0
    for (const list of this.byInstrument.values()) n += list.length
    return n
  }

  /** Alerts this quote satisfies, outside their cooldown and not already being fired. */
  due(q: Quote, now: number): LiveAlert[] {
    const list = this.byInstrument.get(q.id)
    if (!list) return []
    return list.filter(
      (a) => !this.inFlight.has(a.id) && (a.lastTriggeredAt == null || now - a.lastTriggeredAt >= a.cooldownMs) && isMet(a, q),
    )
  }

  claim(a: LiveAlert): void {
    this.inFlight.add(a.id)
  }

  /** After a firing attempt: one-shot alerts leave the book, repeating ones start their cooldown. */
  settle(a: LiveAlert, fired: boolean, now: number): void {
    this.inFlight.delete(a.id)
    const list = this.byInstrument.get(a.instrumentId)
    if (!list) return
    if (!fired || !a.repeat) {
      this.byInstrument.set(
        a.instrumentId,
        list.filter((x) => x.id !== a.id),
      )
      return
    }
    a.lastTriggeredAt = now
  }
}
