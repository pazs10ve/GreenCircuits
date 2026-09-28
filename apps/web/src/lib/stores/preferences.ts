"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { DEFAULT_PREFERENCES, type Preferences as FeedPreferences } from "@greencircuits/contracts/account"
import type { Indicator } from "@/components/charts/indicators"
import { safeStorage } from "./persist"

/**
 * Preferences for this browser. The feed's tuning lives on the account when
 * there is one (live mode); in demo mode it's kept here instead.
 */
export interface Preferences {
  flashPrices: boolean
  alertSound: boolean
  feed: FeedPreferences
  /** Rows a long table shows at once; picked under any table and kept as the default. */
  rowsPerPage: number
  /** How price charts draw: a line of closes, or candles with studies. */
  chartType: "line" | "candles"
  /** The studies on a candle chart. */
  indicators: Indicator[]
}

/** The page sizes a table offers. */
export const ROWS_PER_PAGE = [25, 50, 100] as const

interface PreferenceState extends Preferences {
  set: (patch: Partial<Preferences>) => void
}

export const usePreferences = create<PreferenceState>()(
  persist(
    (set) => ({
      flashPrices: true,
      alertSound: false,
      feed: DEFAULT_PREFERENCES,
      rowsPerPage: 25,
      chartType: "line",
      indicators: ["volume", "sma50"],
      set: (patch) => set(patch),
    }),
    {
      name: "gc.preferences",
      storage: safeStorage,
      version: 4,
      skipHydration: true,
      // Version 1 held the first design's profile fields; keep the two display settings. Later versions added the
      // page size and the chart settings, which start at their defaults.
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Partial<Preferences>
        const base = version < 2 ? { flashPrices: old.flashPrices ?? true, alertSound: old.alertSound ?? false, feed: DEFAULT_PREFERENCES } : old
        return { rowsPerPage: 25, chartType: "line", indicators: ["volume", "sma50"], ...base } as Preferences
      },
      partialize: (s) => ({
        flashPrices: s.flashPrices,
        alertSound: s.alertSound,
        feed: s.feed,
        rowsPerPage: s.rowsPerPage,
        chartType: s.chartType,
        indicators: s.indicators,
      }),
    },
  ),
)

export function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return (parts[0]![0]! + (parts.length > 1 ? parts[1]![0]! : "")).toUpperCase()
}
