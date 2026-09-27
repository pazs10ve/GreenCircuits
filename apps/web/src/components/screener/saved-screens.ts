"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "@/lib/stores/persist"

export interface SavedScreen {
  id: string
  name: string
  query: string
  savedAt: number
}

interface SavedScreensState {
  screens: SavedScreen[]
  save: (name: string, query: string) => SavedScreen
  remove: (id: string) => void
}

/**
 * Screens the user saved, kept in this browser until accounts exist. Like the
 * other persisted stores it skips automatic hydration; the screener loads it
 * after mount so the first client render matches the server.
 */
export const useSavedScreens = create<SavedScreensState>()(
  persist(
    (set, get) => ({
      screens: [],
      save: (name, query) => {
        const screen: SavedScreen = { id: Math.random().toString(36).slice(2, 10), name, query, savedAt: Date.now() }
        set({ screens: [screen, ...get().screens.filter((s) => !(s.name === name && s.query === query))] })
        return screen
      },
      remove: (id) => set({ screens: get().screens.filter((s) => s.id !== id) }),
    }),
    { name: "gc.screens", storage: safeStorage, version: 1, skipHydration: true },
  ),
)
