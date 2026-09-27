import type { Quote } from "@greencircuits/market/types"

/**
 * Client-side quote store: the single place live prices land. Components
 * subscribe per instrument id, so a tick re-renders only the cells showing it.
 * The real WebSocket client will write into this same store.
 */

type Listener = () => void

class QuoteStore {
  private quotes = new Map<number, Quote>()
  private byId = new Map<number, Set<Listener>>()
  private any = new Set<Listener>()
  private version = 0
  status: "idle" | "connecting" | "live" | "paused" = "idle"

  get(id: number | undefined): Quote | undefined {
    return id == null ? undefined : this.quotes.get(id)
  }

  getVersion(): number {
    return this.version
  }

  all(): Quote[] {
    return [...this.quotes.values()]
  }

  apply(quotes: Quote[]): void {
    for (const q of quotes) this.quotes.set(q.id, q)
    this.version++
    for (const q of quotes) this.byId.get(q.id)?.forEach((l) => l())
    this.any.forEach((l) => l())
  }

  setStatus(status: QuoteStore["status"]): void {
    this.status = status
    this.version++
    this.any.forEach((l) => l())
  }

  subscribe(id: number | undefined, listener: Listener): () => void {
    if (id == null) return () => {}
    let set = this.byId.get(id)
    if (!set) {
      set = new Set()
      this.byId.set(id, set)
    }
    set.add(listener)
    return () => set!.delete(listener)
  }

  subscribeAll(listener: Listener): () => void {
    this.any.add(listener)
    return () => this.any.delete(listener)
  }
}

export const quoteStore = new QuoteStore()
