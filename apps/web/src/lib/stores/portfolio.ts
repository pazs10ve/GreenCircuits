"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { EQUITIES } from "@greencircuits/market/catalog"
import { safeStorage } from "./persist"

export interface Holding {
  instrumentId: number
  qty: number
  avgPrice: number
}

interface PortfolioState {
  holdings: Holding[]
  /** The sample, or the reader's own: imported from a broker's file, typed in, or both. */
  source: "sample" | "own"
  importedAt?: Date
  /** An import: the file's holdings replace whatever was there. */
  replace: (holdings: Holding[]) => void
  /** More shares: a new holding, or a top-up of one already held at the combined average cost. */
  add: (holding: Holding) => "started" | "added" | "topped-up"
  update: (instrumentId: number, patch: Pick<Holding, "qty" | "avgPrice">) => void
  /** Removes a holding and returns it, for an undo. */
  remove: (instrumentId: number) => Holding | undefined
  /** Puts a removed holding back where it was. */
  restore: (holding: Holding, index: number) => void
  /** An empty portfolio of the reader's own. */
  clear: () => void
  /** Back to the sample. */
  reset: () => void
}

const SAMPLE: Holding[] = [
  { instrumentId: 100, qty: 40, avgPrice: 1286.4 },
  { instrumentId: 101, qty: 120, avgPrice: 902.15 },
  { instrumentId: 103, qty: 15, avgPrice: 3412 },
  { instrumentId: 106, qty: 60, avgPrice: 1524.8 },
  { instrumentId: 109, qty: 400, avgPrice: 402.1 },
  { instrumentId: 110, qty: 12, avgPrice: 3318.5 },
  { instrumentId: 113, qty: 30, avgPrice: 1540 },
  { instrumentId: 125, qty: 300, avgPrice: 298.6 },
  { instrumentId: 129, qty: 500, avgPrice: 142.3 },
  { instrumentId: 120, qty: 25, avgPrice: 3380 },
]

export const usePortfolio = create<PortfolioState>()(
  persist(
    (set, get) => ({
      holdings: SAMPLE,
      source: "sample",
      replace: (holdings) => set({ holdings, source: "own", importedAt: new Date() }),
      add: (holding) => {
        const { holdings, source } = get()
        // The sample isn't the reader's: their first holding starts a portfolio of their own.
        if (source === "sample") {
          set({ holdings: [holding], source: "own" })
          return "started"
        }
        const held = holdings.find((h) => h.instrumentId === holding.instrumentId)
        if (!held) {
          set({ holdings: [...holdings, holding] })
          return "added"
        }
        const qty = held.qty + holding.qty
        const topped = { ...held, qty, avgPrice: (held.avgPrice * held.qty + holding.avgPrice * holding.qty) / qty }
        set({ holdings: holdings.map((h) => (h === held ? topped : h)) })
        return "topped-up"
      },
      // Editing or removing a sample holding makes the rest of the sample the reader's own.
      update: (instrumentId, patch) =>
        set((s) => ({ holdings: s.holdings.map((h) => (h.instrumentId === instrumentId ? { ...h, ...patch } : h)), source: "own" })),
      remove: (instrumentId) => {
        const gone = get().holdings.find((h) => h.instrumentId === instrumentId)
        if (gone) set((s) => ({ holdings: s.holdings.filter((h) => h !== gone), source: "own" }))
        return gone
      },
      restore: (holding, index) =>
        set((s) => {
          if (s.holdings.some((h) => h.instrumentId === holding.instrumentId)) return s
          const holdings = [...s.holdings]
          holdings.splice(Math.min(index, holdings.length), 0, holding)
          return { holdings, source: "own" }
        }),
      clear: () => set({ holdings: [], source: "own", importedAt: undefined }),
      reset: () => set({ holdings: SAMPLE, source: "sample", importedAt: undefined }),
    }),
    {
      name: "gc.portfolio",
      storage: safeStorage,
      version: 2,
      skipHydration: true,
      // Version 1 called the reader's own holdings "import", when importing was the only way to have them.
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as { holdings?: Holding[]; source?: string; importedAt?: Date }
        if (version < 2) return { ...old, source: old.source === "import" ? "own" : "sample" } as PortfolioState
        return old as PortfolioState
      },
    },
  ),
)

export interface ImportResult {
  holdings: Holding[]
  skipped: string[]
}

/**
 * Parse a broker holdings export. Accepts any CSV with a symbol column
 * ("Instrument", "Symbol", "Tradingsymbol"), a quantity column ("Qty.",
 * "Quantity") and an average cost column ("Avg. cost", "Average price").
 * Zerodha Console, Groww and Upstox exports all fit.
 */
export function parseHoldingsCsv(text: string): ImportResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "")
  if (lines.length < 2) return { holdings: [], skipped: ["The file has no data rows."] }
  const split = (line: string) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
  const header = split(lines[0]!).map((h) => h.toLowerCase())
  const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h.replace(/[^a-z]/g, "") === n))
  const iSym = find("instrument", "symbol", "tradingsymbol", "stock", "stockname")
  const iQty = find("qty", "quantity", "netqty", "shares")
  const iAvg = find("avgcost", "averageprice", "avgprice", "buyavg", "averagecost")
  if (iSym < 0 || iQty < 0 || iAvg < 0) {
    return { holdings: [], skipped: ["Couldn't find symbol, quantity and average cost columns in the header."] }
  }
  const bySymbol = new Map(EQUITIES.map((e) => [e.symbol, e]))
  const holdings: Holding[] = []
  const skipped: string[] = []
  for (const line of lines.slice(1)) {
    const cols = split(line)
    const symbol = (cols[iSym] ?? "").toUpperCase().replace(/-EQ$|\.NS$|\.BO$/, "")
    const qty = Number(cols[iQty])
    const avg = Number(cols[iAvg])
    const inst = bySymbol.get(symbol)
    if (!inst) {
      if (symbol) skipped.push(`${symbol}: not in the demo universe`)
      continue
    }
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(avg) || avg <= 0) {
      skipped.push(`${symbol}: quantity or price isn't a positive number`)
      continue
    }
    const existing = holdings.find((h) => h.instrumentId === inst.id)
    if (existing) {
      const total = existing.qty + qty
      existing.avgPrice = (existing.avgPrice * existing.qty + avg * qty) / total
      existing.qty = total
    } else {
      holdings.push({ instrumentId: inst.id, qty, avgPrice: avg })
    }
  }
  return { holdings, skipped }
}
