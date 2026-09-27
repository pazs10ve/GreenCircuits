"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { INDEX } from "@greencircuits/market/catalog"
import { safeStorage } from "./persist"

/**
 * Trading and investment plans with the journal that is checked against them
 * (lab.plan and lab.journal_entry). The platform stores what the user writes;
 * it never suggests a plan.
 */

export type PlanKind = "INVESTMENT" | "TRADING"
export type ReviewCadence = "Weekly" | "Fortnightly" | "Monthly" | "Quarterly"
export type Emotion = "Calm" | "Confident" | "Anxious" | "FOMO" | "Revenge" | "Impatient"
export type Direction = "LONG" | "SHORT"

export interface PlanRule {
  id: string
  label: string
}

export interface TradingPlan {
  id: string
  name: string
  kind: PlanKind
  goal: string
  horizon: string
  capital: number
  /** Trading plans: risk limits. */
  maxRiskPct?: number
  maxDailyLossPct?: number
  maxOpenPositions?: number
  noFirst15?: boolean
  /** Investment plans: monthly SIP and yearly step-up. */
  sip?: number
  stepUpPct?: number
  rules: PlanRule[]
  setups: string[]
  review: ReviewCadence
  updatedAt: Date
}

export interface JournalEntry {
  id: string
  /** IST trade date, YYYY-MM-DD. */
  date: string
  instrumentId: number
  setup: string
  direction: Direction
  entry: number
  exit: number
  qty: number
  emotion: Emotion
  followedPlan: boolean
  planId?: string
  notes: string
}

export const EMOTIONS: Emotion[] = ["Calm", "Confident", "Anxious", "FOMO", "Revenge", "Impatient"]
export const CADENCES: ReviewCadence[] = ["Weekly", "Fortnightly", "Monthly", "Quarterly"]

export function entryPnl(e: Pick<JournalEntry, "entry" | "exit" | "qty" | "direction">): number {
  return (e.exit - e.entry) * e.qty * (e.direction === "LONG" ? 1 : -1)
}

const updated = new Date(Date.UTC(2026, 8, 20, 6, 0))

const PLANS: TradingPlan[] = [
  {
    id: "core",
    name: "Core: monthly SIP into NIFTY 50",
    kind: "INVESTMENT",
    goal: "Build ₹50 lakh by March 2036",
    horizon: "10 years",
    capital: 1_500_000,
    sip: 25_000,
    stepUpPct: 10,
    rules: [
      { id: "c1", label: "SIP on the 5th of every month, whatever the market did" },
      { id: "c2", label: "Step the SIP up by 10% every April" },
      { id: "c3", label: "No redemptions during a drawdown" },
      { id: "c4", label: "Index fund only: NIFTY 50, expense ratio under 0.2%" },
    ],
    setups: ["SIP", "Step-up"],
    review: "Quarterly",
    updatedAt: updated,
  },
  {
    id: "satellite",
    name: "Satellite: momentum swing trades",
    kind: "TRADING",
    goal: "Beat NIFTY 50 by 5 points a year with drawdowns under 15%",
    horizon: "Rolling 12 months",
    capital: 600_000,
    maxRiskPct: 1,
    maxDailyLossPct: 2,
    maxOpenPositions: 5,
    noFirst15: true,
    rules: [
      { id: "s1", label: "Long only above the 200-day average" },
      { id: "s2", label: "No averaging down" },
      { id: "s3", label: "Journal every trade the same day" },
    ],
    setups: ["52-week breakout", "Pullback to 20 EMA", "RSI dip"],
    review: "Weekly",
    updatedAt: updated,
  },
  {
    id: "options",
    name: "Options income: weekly credit spreads",
    kind: "TRADING",
    goal: "1.5–2% a month on deployed margin",
    horizon: "6 months, then review",
    capital: 400_000,
    maxRiskPct: 2,
    maxDailyLossPct: 3,
    maxOpenPositions: 3,
    noFirst15: true,
    rules: [
      { id: "o1", label: "Defined-risk spreads only, never naked" },
      { id: "o2", label: "Exit at 50% of credit, or at a loss of 1.5× credit" },
      { id: "o3", label: "No new positions after 13:00 on expiry day" },
    ],
    setups: ["Bull put spread", "Bear call spread", "Iron condor"],
    review: "Weekly",
    updatedAt: updated,
  },
]

const N = INDEX.NIFTY
const e = (
  id: string, date: string, instrumentId: number, setup: string, direction: Direction, entry: number, exit: number,
  qty: number, emotion: Emotion, followedPlan: boolean, planId: string, notes: string,
): JournalEntry => ({ id, date, instrumentId, setup, direction, entry, exit, qty, emotion, followedPlan, planId, notes })

const ENTRIES: JournalEntry[] = [
  e("j15", "2026-09-25", N, "Bull put spread", "SHORT", 35.4, 14.1, 65, "Calm", true, "options", "24,800/24,700 put spread. Closed at 60% of credit on Friday afternoon."),
  e("j14", "2026-09-24", 113, "RSI dip", "LONG", 1622.1, 1598.3, 30, "Impatient", false, "satellite", "Bought before RSI closed below 30. The plan says wait for the close."),
  e("j13", "2026-09-22", 123, "52-week breakout", "LONG", 1404.5, 1438.9, 60, "Calm", true, "satellite", "Breakout held on the retest. Exited on the 10-day low trail."),
  e("j12", "2026-09-18", 110, "Pullback to 20 EMA", "LONG", 3588, 3651.4, 15, "Confident", true, "satellite", "Third touch of the 20 EMA in an uptrend. Took profit into the prior high."),
  e("j11", "2026-09-16", N, "Bear call spread", "SHORT", 41.8, 12.25, 65, "Calm", true, "options", "Sold above the week's high after a failed rally."),
  e("j10", "2026-09-15", 107, "52-week breakout", "LONG", 951, 918.4, 100, "Revenge", false, "satellite", "Doubled size after Friday's miss. Loss was 2.2× the planned 1% risk."),
  e("j09", "2026-09-11", 105, "RSI dip", "LONG", 796.2, 822.45, 70, "Calm", true, "satellite", "RSI 27 above the 200-day average. Target hit in six sessions."),
  e("j08", "2026-09-09", 101, "Pullback to 20 EMA", "LONG", 978.6, 969.1, 100, "Calm", true, "satellite", "Stopped at the swing low. The setup was valid; nothing to change."),
  e("j07", "2026-09-07", 129, "52-week breakout", "LONG", 158.4, 167.95, 700, "Confident", true, "satellite", "Metals strong across the board. Booked half at 5%, trailed the rest."),
  e("j06", "2026-09-03", N, "Iron condor", "SHORT", 64.5, 88.3, 65, "Anxious", true, "options", "Range broke on the CPI print. Exited at the 1.5× credit stop as planned."),
  e("j05", "2026-09-02", 106, "RSI dip", "LONG", 1452.3, 1441, 60, "Anxious", true, "satellite", "Stayed heavy ahead of results. Time exit after eight sessions."),
  e("j04", "2026-08-31", 104, "Pullback to 20 EMA", "LONG", 1388, 1429.5, 40, "Confident", true, "satellite", "Held the 20 EMA; exited into the prior high."),
  e("j03", "2026-08-28", 121, "52-week breakout", "LONG", 318.9, 306.1, 300, "FOMO", false, "satellite", "Chased a gap-up at 09:17, inside the first 15 minutes. Stopped out the same afternoon."),
  e("j02", "2026-08-25", N, "Bull put spread", "SHORT", 38.2, 9.6, 65, "Calm", true, "options", "24,500/24,400 put spread, four sessions to expiry. Closed at 75% of credit."),
  e("j01", "2026-08-24", 125, "52-week breakout", "LONG", 392.4, 411.85, 250, "Calm", true, "satellite", "Clean breakout on 1.8× average delivery. Trailed with the 10-day low."),
]

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

interface JournalState {
  plans: TradingPlan[]
  entries: JournalEntry[]
  savePlan: (plan: Omit<TradingPlan, "id" | "updatedAt"> & { id?: string }) => string
  removePlan: (id: string) => void
  addEntry: (entry: Omit<JournalEntry, "id">) => void
  removeEntry: (id: string) => void
}

export const useJournal = create<JournalState>()(
  persist(
    (set, get) => ({
      plans: PLANS,
      entries: ENTRIES,
      savePlan: (plan) => {
        const id = plan.id ?? newId()
        const next = { ...plan, id, updatedAt: new Date() }
        const exists = get().plans.some((p) => p.id === id)
        set({ plans: exists ? get().plans.map((p) => (p.id === id ? next : p)) : [...get().plans, next] })
        return id
      },
      removePlan: (id) =>
        set({
          plans: get().plans.filter((p) => p.id !== id),
          entries: get().entries.map((x) => (x.planId === id ? { ...x, planId: undefined } : x)),
        }),
      addEntry: (entry) =>
        set({ entries: [{ ...entry, id: newId() }, ...get().entries].sort((a, b) => b.date.localeCompare(a.date)) }),
      removeEntry: (id) => set({ entries: get().entries.filter((x) => x.id !== id) }),
    }),
    { name: "gc.journal", storage: safeStorage, version: 1, skipHydration: true },
  ),
)
