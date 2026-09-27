"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "./persist"

/**
 * Alert rules, in the shape the alert engine consumes (app.alert_rule). The
 * engine evaluates them against the tick stream server-side; until accounts
 * exist, the browser evaluates them against the simulated feed.
 */
export type AlertCondition = "PRICE_ABOVE" | "PRICE_BELOW" | "CHANGE_ABOVE" | "CHANGE_BELOW"
export type AlertChannel = "IN_APP" | "EMAIL" | "TELEGRAM"
export type AlertStatus = "ACTIVE" | "TRIGGERED" | "PAUSED"

export interface Alert {
  id: string
  instrumentId: number
  condition: AlertCondition
  value: number
  channels: AlertChannel[]
  note?: string
  status: AlertStatus
  repeat: boolean
  createdAt: Date
  triggeredAt?: Date
  triggeredPrice?: number
}

interface AlertState {
  alerts: Alert[]
  create: (a: Omit<Alert, "id" | "status" | "createdAt">) => void
  update: (id: string, patch: Partial<Alert>) => void
  remove: (id: string) => void
  trigger: (id: string, price: number) => void
}

const SEED: Alert[] = [
  { id: "a1", instrumentId: 100, condition: "PRICE_ABOVE", value: 1440, channels: ["IN_APP", "EMAIL"], status: "ACTIVE", repeat: false, createdAt: new Date(Date.UTC(2026, 8, 22, 4, 30)), note: "Breakout above the September range" },
  { id: "a2", instrumentId: 1, condition: "CHANGE_BELOW", value: -1.5, channels: ["IN_APP", "TELEGRAM"], status: "ACTIVE", repeat: true, createdAt: new Date(Date.UTC(2026, 8, 15, 3, 50)) },
  { id: "a3", instrumentId: 106, condition: "PRICE_BELOW", value: 1400, channels: ["IN_APP"], status: "ACTIVE", repeat: false, createdAt: new Date(Date.UTC(2026, 8, 24, 6, 5)), note: "Add on dip before results" },
  { id: "a4", instrumentId: 300, condition: "PRICE_ABOVE", value: 108000, channels: ["IN_APP", "EMAIL"], status: "TRIGGERED", repeat: false, createdAt: new Date(Date.UTC(2026, 8, 10, 5, 0)), triggeredAt: new Date(Date.UTC(2026, 8, 19, 7, 42)), triggeredPrice: 108012 },
  { id: "a5", instrumentId: 7, condition: "PRICE_ABOVE", value: 15, channels: ["TELEGRAM"], status: "PAUSED", repeat: true, createdAt: new Date(Date.UTC(2026, 7, 28, 4, 0)) },
]

export const useAlerts = create<AlertState>()(
  persist(
    (set, get) => ({
      alerts: SEED,
      create: (a) =>
        set({
          alerts: [{ ...a, id: Math.random().toString(36).slice(2, 10), status: "ACTIVE", createdAt: new Date() }, ...get().alerts],
        }),
      update: (id, patch) => set({ alerts: get().alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }),
      remove: (id) => set({ alerts: get().alerts.filter((a) => a.id !== id) }),
      trigger: (id, price) =>
        set({
          alerts: get().alerts.map((a) =>
            a.id === id ? { ...a, status: a.repeat ? "ACTIVE" : "TRIGGERED", triggeredAt: new Date(), triggeredPrice: price } : a,
          ),
        }),
    }),
    { name: "gc.alerts", storage: safeStorage, version: 1, skipHydration: true },
  ),
)

export const CONDITION_LABEL: Record<AlertCondition, string> = {
  PRICE_ABOVE: "Price rises above",
  PRICE_BELOW: "Price falls below",
  CHANGE_ABOVE: "Day change above",
  CHANGE_BELOW: "Day change below",
}

export function isPercent(c: AlertCondition): boolean {
  return c === "CHANGE_ABOVE" || c === "CHANGE_BELOW"
}
