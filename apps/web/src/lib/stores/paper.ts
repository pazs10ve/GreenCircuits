"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import type { Quote } from "@greencircuits/market/types"
import { formatINR } from "@greencircuits/market/format"
import { istDateKey } from "@/lib/lab/dates"
import { chargesFor, marginRate, type PaperProduct, type PaperSide } from "@/lib/lab/paper"
import { safeStorage } from "./persist"

/**
 * The virtual account, in the shape of lab.paper_account, paper_order and
 * paper_position. Orders fill against the simulated feed in the browser; the
 * paper runner will do this server-side on the live bar stream.
 */

export type PaperOrderType = "MARKET" | "LIMIT"
export type PaperOrderStatus = "OPEN" | "FILLED" | "CANCELLED" | "REJECTED"

export interface PaperOrder {
  id: string
  instrumentId: number
  side: PaperSide
  /** Units: shares, or lots × lot size for futures. */
  qty: number
  type: PaperOrderType
  product: PaperProduct
  limitPrice?: number
  status: PaperOrderStatus
  placedAt: Date
  filledAt?: Date
  fillPrice?: number
  charges?: number
  /** P&L booked by the closing part of this fill, before charges. */
  realised?: number
  rejectReason?: string
}

export interface PaperPosition {
  instrumentId: number
  product: PaperProduct
  /** Signed: negative is short. */
  qty: number
  avgPrice: number
  /** Funds blocked for the position (full value for CNC). */
  margin: number
  openedAt: Date
}

export interface PaperDeployment {
  strategyId: string
  version: number
  status: "RUNNING" | "STOPPED"
  startedAt: Date
  stoppedAt?: Date
}

export interface NewOrder {
  instrumentId: number
  side: PaperSide
  qty: number
  type: PaperOrderType
  product: PaperProduct
  limitPrice?: number
}

export const STARTING_CAPITAL = 1_000_000

interface Book {
  cash: number
  positions: PaperPosition[]
}

type FillResult = { book: Book; charges: number; realised: number } | { error: string }

const r2 = (v: number) => Math.round(v * 100) / 100

/** Apply one fill to cash and positions, or explain why the account can't take it. */
export function applyFill(book: Book, o: Pick<NewOrder, "instrumentId" | "side" | "qty" | "product">, price: number, at: Date): FillResult {
  const inst = getInstrument(o.instrumentId)
  if (!inst) return { error: "Unknown instrument." }
  if (!(Number.isInteger(o.qty) && o.qty > 0)) return { error: "Quantity must be a whole number above zero." }
  if (!(price > 0)) return { error: "No live price yet." }
  const positions = book.positions.slice()
  const idx = positions.findIndex((p) => p.instrumentId === o.instrumentId && p.product === o.product)
  const pos = idx >= 0 ? positions[idx] : undefined
  if (o.product === "CNC" && o.side === "SELL" && (pos?.qty ?? 0) < o.qty)
    return { error: `You hold ${pos?.qty ?? 0} ${inst.symbol} in CNC. Sell up to that, or use MIS to short intraday.` }

  const rate = marginRate(inst, o.product)
  const charges = chargesFor(inst, o.product, o.side, o.qty, price).total
  const signed = o.side === "BUY" ? o.qty : -o.qty
  let cash = book.cash - charges
  let realised = 0

  if (!pos || Math.sign(pos.qty) === Math.sign(signed)) {
    const add = o.qty * price * rate
    cash -= add
    const qty = (pos?.qty ?? 0) + signed
    const avgPrice = pos ? (Math.abs(pos.qty) * pos.avgPrice + o.qty * price) / Math.abs(qty) : price
    const next = { instrumentId: o.instrumentId, product: o.product, qty, avgPrice, margin: (pos?.margin ?? 0) + add, openedAt: pos?.openedAt ?? at }
    if (pos) positions[idx] = next
    else positions.push(next)
  } else {
    const closing = Math.min(o.qty, Math.abs(pos.qty))
    realised = closing * (price - pos.avgPrice) * Math.sign(pos.qty)
    const released = pos.margin * (closing / Math.abs(pos.qty))
    cash += released + realised
    const opening = o.qty - closing
    if (opening === 0) {
      const remaining = pos.qty + signed
      if (remaining === 0) positions.splice(idx, 1)
      else positions[idx] = { ...pos, qty: remaining, margin: pos.margin - released }
    } else {
      const add = opening * price * rate
      cash -= add
      positions[idx] = { instrumentId: o.instrumentId, product: o.product, qty: Math.sign(signed) * opening, avgPrice: price, margin: add, openedAt: at }
    }
  }
  if (cash < 0) return { error: `Needs ${formatINR(book.cash - cash, 0)}; ${formatINR(book.cash, 0)} is available.` }
  return { book: { cash: r2(cash), positions }, charges, realised: r2(realised) }
}

export interface AccountSummary {
  equity: number
  cash: number
  marginUsed: number
  unrealised: number
  dayPnl: number
  totalPnl: number
  ready: boolean
}

/** Account value at live prices. `read` returns undefined until quotes are available. */
export function summarize(
  s: { cash: number; positions: PaperPosition[]; orders: PaperOrder[]; startingCapital: number },
  read: (id: number) => Quote | undefined,
  todayKey: string | null,
): AccountSummary {
  let unrealised = 0
  let marginUsed = 0
  let dayPnl = 0
  let ready = true
  for (const p of s.positions) {
    const q = read(p.instrumentId)
    marginUsed += p.margin
    if (!q) {
      ready = false
      continue
    }
    unrealised += (q.ltp - p.avgPrice) * p.qty
    const ref = todayKey && istDateKey(p.openedAt) === todayKey ? p.avgPrice : q.prevClose
    dayPnl += (q.ltp - ref) * p.qty
  }
  if (todayKey) {
    for (const o of s.orders) {
      if (o.status === "FILLED" && o.filledAt && istDateKey(o.filledAt) === todayKey) dayPnl += (o.realised ?? 0) - (o.charges ?? 0)
    }
  }
  const equity = s.cash + marginUsed + unrealised
  return { equity, cash: s.cash, marginUsed, unrealised, dayPnl, totalPnl: equity - s.startingCapital, ready: ready && todayKey != null }
}

/** IST wall-clock time as a Date. */
const ist = (m: number, d: number, hh: number, mm: number) => new Date(Date.UTC(2026, m - 1, d, hh, mm) - 5.5 * 3600 * 1000)

function seed() {
  let book: Book = { cash: STARTING_CAPITAL, positions: [] }
  const orders: PaperOrder[] = []
  const fills: [number, NewOrder, number, Date][] = [
    [1, { instrumentId: 101, side: "BUY", qty: 120, type: "MARKET", product: "CNC" }, 972.15, ist(9, 21, 10, 12)],
    [2, { instrumentId: 100, side: "BUY", qty: 40, type: "MARKET", product: "CNC" }, 1386.4, ist(9, 22, 11, 40)],
    [3, { instrumentId: 106, side: "BUY", qty: 25, type: "MARKET", product: "MIS" }, 1471.2, ist(9, 22, 9, 40)],
    [4, { instrumentId: 106, side: "SELL", qty: 25, type: "LIMIT", product: "MIS", limitPrice: 1486.9 }, 1486.9, ist(9, 22, 14, 55)],
    [5, { instrumentId: INDEX.NIFTY, side: "BUY", qty: getInstrument(INDEX.NIFTY)!.lot!, type: "MARKET", product: "NRML" }, 24968.5, ist(9, 23, 9, 48)],
    [6, { instrumentId: 129, side: "BUY", qty: 300, type: "MARKET", product: "CNC" }, 162.85, ist(9, 24, 14, 5)],
  ]
  for (const [n, o, price, at] of fills) {
    const res = applyFill(book, o, price, at)
    if ("error" in res) continue
    book = res.book
    orders.push({ ...o, id: `seed${n}`, status: "FILLED", placedAt: at, filledAt: at, fillPrice: price, charges: res.charges, realised: res.realised })
  }
  orders.push({ id: "seed7", instrumentId: 109, side: "SELL", qty: 10, type: "MARKET", product: "CNC", status: "REJECTED", placedAt: ist(9, 24, 14, 20), rejectReason: "You hold 0 ITC in CNC. Sell up to that, or use MIS to short intraday." })
  orders.push({ id: "seed8", instrumentId: 103, side: "BUY", qty: 20, type: "LIMIT", product: "CNC", limitPrice: 3010, status: "OPEN", placedAt: ist(9, 25, 10, 30) })
  return { cash: book.cash, positions: book.positions, orders: orders.reverse() }
}

const SEED = seed()

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

interface PaperState {
  startingCapital: number
  cash: number
  positions: PaperPosition[]
  orders: PaperOrder[]
  deployments: PaperDeployment[]
  /** Place an order. Market orders (and limits already through the market) fill at `ltp`. */
  place: (order: NewOrder, ltp: number | undefined) => PaperOrder
  /** Fill a resting limit order at `price`. */
  fillOpen: (orderId: string, price: number) => PaperOrder | undefined
  cancel: (orderId: string) => void
  exitPosition: (instrumentId: number, product: PaperProduct, ltp: number) => PaperOrder | undefined
  deploy: (strategyId: string, version: number) => boolean
  stopDeployment: (strategyId: string) => void
  reset: () => void
}

export const usePaper = create<PaperState>()(
  persist(
    (set, get) => ({
      startingCapital: STARTING_CAPITAL,
      cash: SEED.cash,
      positions: SEED.positions,
      orders: SEED.orders,
      deployments: [],
      place: (input, ltp) => {
        const now = new Date()
        const base: PaperOrder = { ...input, id: newId(), status: "OPEN", placedAt: now }
        const s = get()
        let order: PaperOrder = base
        if (input.type === "LIMIT" && !(input.limitPrice && input.limitPrice > 0)) {
          order = { ...base, status: "REJECTED", rejectReason: "Enter a limit price above zero." }
        } else {
          const marketable =
            input.type === "MARKET" || (ltp != null && (input.side === "BUY" ? ltp <= input.limitPrice! : ltp >= input.limitPrice!))
          const price = marketable ? ltp : input.limitPrice
          const res = price == null ? ({ error: "No live price yet." } as const) : applyFill(s, input, price, now)
          if ("error" in res) order = { ...base, status: "REJECTED", rejectReason: res.error }
          else if (marketable) {
            order = { ...base, status: "FILLED", filledAt: now, fillPrice: price, charges: res.charges, realised: res.realised }
            set({ cash: res.book.cash, positions: res.book.positions })
          }
        }
        set({ orders: [order, ...get().orders] })
        return order
      },
      fillOpen: (orderId, price) => {
        const s = get()
        const o = s.orders.find((x) => x.id === orderId && x.status === "OPEN")
        if (!o) return undefined
        const now = new Date()
        const res = applyFill(s, o, price, now)
        const next: PaperOrder =
          "error" in res
            ? { ...o, status: "REJECTED", rejectReason: res.error }
            : { ...o, status: "FILLED", filledAt: now, fillPrice: price, charges: res.charges, realised: res.realised }
        set({
          ...("error" in res ? {} : { cash: res.book.cash, positions: res.book.positions }),
          orders: s.orders.map((x) => (x.id === orderId ? next : x)),
        })
        return next
      },
      cancel: (orderId) =>
        set({ orders: get().orders.map((o) => (o.id === orderId && o.status === "OPEN" ? { ...o, status: "CANCELLED" } : o)) }),
      exitPosition: (instrumentId, product, ltp) => {
        const pos = get().positions.find((p) => p.instrumentId === instrumentId && p.product === product)
        if (!pos) return undefined
        return get().place({ instrumentId, product, side: pos.qty > 0 ? "SELL" : "BUY", qty: Math.abs(pos.qty), type: "MARKET" }, ltp)
      },
      deploy: (strategyId, version) => {
        if (get().deployments.some((d) => d.strategyId === strategyId && d.status === "RUNNING")) return false
        set({ deployments: [{ strategyId, version, status: "RUNNING", startedAt: new Date() }, ...get().deployments.filter((d) => d.strategyId !== strategyId)] })
        return true
      },
      stopDeployment: (strategyId) =>
        set({
          deployments: get().deployments.map((d) =>
            d.strategyId === strategyId && d.status === "RUNNING" ? { ...d, status: "STOPPED", stoppedAt: new Date() } : d,
          ),
        }),
      reset: () => set({ startingCapital: STARTING_CAPITAL, cash: STARTING_CAPITAL, positions: [], orders: [], deployments: [] }),
    }),
    { name: "gc.paper", storage: safeStorage, version: 1, skipHydration: true },
  ),
)
