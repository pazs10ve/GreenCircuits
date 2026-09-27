"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "./persist"

export interface Preferences {
  displayName: string
  email: string
  experience: "learning" | "investor" | "trader" | "quant"
  flashPrices: boolean
  alertSound: boolean
  premarketBrief: boolean
  weeklySummary: boolean
  telegramLinked: boolean
}

interface PreferenceState extends Preferences {
  set: (patch: Partial<Preferences>) => void
}

export const usePreferences = create<PreferenceState>()(
  persist(
    (set) => ({
      displayName: "Demo investor",
      email: "",
      experience: "investor",
      flashPrices: true,
      alertSound: false,
      premarketBrief: true,
      weeklySummary: true,
      telegramLinked: false,
      set: (patch) => set(patch),
    }),
    { name: "gc.preferences", storage: safeStorage, version: 1, skipHydration: true },
  ),
)

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return (parts[0]![0]! + (parts.length > 1 ? parts.at(-1)![0]! : "")).toUpperCase()
}
