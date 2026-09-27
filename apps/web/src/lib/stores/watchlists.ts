"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { safeStorage } from "./persist"

export interface Watchlist {
  id: string
  name: string
  ids: number[]
}

interface WatchlistState {
  lists: Watchlist[]
  activeId: string
  setActive: (id: string) => void
  create: (name: string) => string
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  add: (listId: string, instrumentId: number) => void
  removeItem: (listId: string, instrumentId: number) => void
  toggle: (listId: string, instrumentId: number) => void
  move: (listId: string, from: number, to: number) => void
}

const DEFAULTS: Watchlist[] = [
  { id: "core", name: "Core holdings", ids: [100, 101, 103, 104, 106, 102] },
  { id: "fo", name: "F&O watch", ids: [1, 3, 105, 107, 121, 115] },
  { id: "macro", name: "Macro", ids: [7, 400, 300, 302, 301] },
]

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export const useWatchlists = create<WatchlistState>()(
  persist(
    (set, get) => ({
      lists: DEFAULTS,
      activeId: DEFAULTS[0]!.id,
      setActive: (id) => set({ activeId: id }),
      create: (name) => {
        const id = newId()
        set({ lists: [...get().lists, { id, name, ids: [] }], activeId: id })
        return id
      },
      rename: (id, name) => set({ lists: get().lists.map((l) => (l.id === id ? { ...l, name } : l)) }),
      remove: (id) => {
        const lists = get().lists.filter((l) => l.id !== id)
        set({ lists, activeId: get().activeId === id ? (lists[0]?.id ?? "") : get().activeId })
      },
      add: (listId, instrumentId) =>
        set({
          lists: get().lists.map((l) =>
            l.id === listId && !l.ids.includes(instrumentId) ? { ...l, ids: [...l.ids, instrumentId] } : l,
          ),
        }),
      removeItem: (listId, instrumentId) =>
        set({ lists: get().lists.map((l) => (l.id === listId ? { ...l, ids: l.ids.filter((i) => i !== instrumentId) } : l)) }),
      toggle: (listId, instrumentId) => {
        const list = get().lists.find((l) => l.id === listId)
        if (list?.ids.includes(instrumentId)) get().removeItem(listId, instrumentId)
        else get().add(listId, instrumentId)
      },
      move: (listId, from, to) =>
        set({
          lists: get().lists.map((l) => {
            if (l.id !== listId) return l
            const ids = [...l.ids]
            const [item] = ids.splice(from, 1)
            if (item != null) ids.splice(to, 0, item)
            return { ...l, ids }
          }),
        }),
    }),
    { name: "gc.watchlists", storage: safeStorage, version: 1, skipHydration: true },
  ),
)

/** Lists that contain the instrument. */
export function useListsContaining(instrumentId: number): Watchlist[] {
  return useWatchlists((s) => s.lists).filter((l) => l.ids.includes(instrumentId))
}
