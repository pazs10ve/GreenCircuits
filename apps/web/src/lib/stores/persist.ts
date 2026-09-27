import { createJSONStorage, type StateStorage } from "zustand/middleware"

/**
 * localStorage that never throws (private windows, blocked storage, SSR).
 * The UI state kept here is a convenience; the API will own it once accounts exist.
 */
const safe: StateStorage = {
  getItem: (key) => {
    try {
      return typeof window === "undefined" ? null : window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Storage full or blocked: keep working in memory.
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore.
    }
  },
}

/** Dates survive the JSON round trip. */
export const safeStorage = createJSONStorage(() => safe, {
  reviver: (_key, value) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) ? new Date(value) : value,
})

/** Plain JSON, for records whose timestamps should stay strings. */
export const plainStorage = createJSONStorage(() => safe)
