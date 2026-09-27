"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { DEFAULT_PREFERENCES, type Preferences as FeedPreferences } from "@greencircuits/contracts/account"
import { safeStorage } from "./persist"

/**
 * Preferences for this browser. The feed's tuning lives on the account when
 * there is one (live mode); in demo mode it's kept here instead.
 */
export interface Preferences {
  flashPrices: boolean
  alertSound: boolean
  feed: FeedPreferences
}

interface PreferenceState extends Preferences {
  set: (patch: Partial<Preferences>) => void
}

export const usePreferences = create<PreferenceState>()(
  persist(
    (set) => ({
      flashPrices: true,
      alertSound: false,
      feed: DEFAULT_PREFERENCES,
      set: (patch) => set(patch),
    }),
    {
      name: "gc.preferences",
      storage: safeStorage,
      version: 2,
      skipHydration: true,
      // Version 1 held the first design's profile fields; keep the two display settings.
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Partial<Preferences>
        if (version < 2) return { flashPrices: old.flashPrices ?? true, alertSound: old.alertSound ?? false, feed: DEFAULT_PREFERENCES }
        return old as Preferences
      },
      partialize: (s) => ({ flashPrices: s.flashPrices, alertSound: s.alertSound, feed: s.feed }),
    },
  ),
)

export function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return (parts[0]![0]! + (parts.length > 1 ? parts[1]![0]! : "")).toUpperCase()
}
