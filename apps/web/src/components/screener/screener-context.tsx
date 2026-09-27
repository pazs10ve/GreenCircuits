"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { ScreenRow } from "@greencircuits/market/fundamentals"
import type { Quote } from "@greencircuits/market/types"
import { getInstrument } from "@greencircuits/market/catalog"
import { DEFAULT_COLUMNS, FIELDS, type LiveRow } from "./fields"
import { PRESETS } from "./presets"
import { compileQuery, normalizeQuery, type CompiledOk, type QueryError } from "./query"
import { useSavedScreens } from "./saved-screens"

export interface ActiveScreen {
  kind: "preset" | "saved"
  id: string
  name: string
  description?: string
}

interface ScreenerContextValue {
  rows: ScreenRow[]
  /** Text in the editor. */
  draft: string
  setDraft: (value: string) => void
  /** The last query that ran successfully; the results show this one. */
  applied: CompiledOk
  /** Error from the last run, shown while the text is unchanged since. */
  error: QueryError | null
  /** Compile and apply the editor text, or the given text. Returns false on an error. */
  run: (source?: string) => boolean
  /** The preset or saved screen the applied query came from. */
  active: ActiveScreen | null
  /** Visible result columns, by field name, in reference order. */
  columns: string[]
  toggleColumn: (name: string) => void
  resetColumns: () => void
  /** Changes when a column is hidden, so the table drops any sort on it. */
  tableKey: number
}

const ScreenerContext = createContext<ScreenerContextValue | null>(null)

export function useScreener(): ScreenerContextValue {
  const value = useContext(ScreenerContext)
  if (!value) throw new Error("useScreener must be used inside <ScreenerProvider>")
  return value
}

const ORDER = new Map(FIELDS.map((f, i) => [f.name, i]))
const ordered = (names: Iterable<string>) => [...new Set(names)].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!)

/** Merge live quotes into the snapshot rows. */
export function toLiveRows(rows: ScreenRow[], read: (id: number) => Quote | undefined): LiveRow[] {
  return rows.map((r) => {
    const q = read(r.id)
    return { ...r, price: q?.ltp ?? null, changePct: q?.changePct ?? null }
  })
}

export function stockHref(id: number): string {
  return `/stocks/${getInstrument(id)?.slug ?? ""}`
}

export function ScreenerProvider({
  rows,
  initialQuery,
  children,
}: {
  rows: ScreenRow[]
  initialQuery: string
  children: React.ReactNode
}) {
  // A bad ?q= still loads the page: show every stock and the error.
  const [initial] = useState(() => {
    const compiled = compileQuery(initialQuery)
    return compiled.ok
      ? { applied: compiled, failed: null }
      : { applied: compileQuery("") as CompiledOk, failed: { source: initialQuery, error: compiled.error } }
  })
  const [draft, setDraft] = useState(initialQuery)
  const [applied, setApplied] = useState<CompiledOk>(initial.applied)
  const [failed, setFailed] = useState<{ source: string; error: QueryError } | null>(initial.failed)
  const [columns, setColumns] = useState<string[]>(() => ordered([...DEFAULT_COLUMNS, ...initial.applied.fields.map((f) => f.name)]))
  const [tableKey, setTableKey] = useState(0)
  const saved = useSavedScreens((s) => s.screens)

  useEffect(() => {
    void useSavedScreens.persist.rehydrate()
  }, [])

  const run = useCallback(
    (source?: string) => {
      const text = source ?? draft
      if (source != null) setDraft(source)
      const compiled = compileQuery(text)
      if (!compiled.ok) {
        setFailed({ source: text, error: compiled.error })
        return false
      }
      setApplied(compiled)
      setFailed(null)
      // Show the fields the query filters on.
      setColumns((prev) => {
        const missing = compiled.fields.map((f) => f.name).filter((n) => !prev.includes(n))
        return missing.length ? ordered([...prev, ...missing]) : prev
      })
      // Keep the screen in the URL so it can be shared or reloaded.
      const url = new URL(window.location.href)
      if (text.trim()) url.searchParams.set("q", text.trim())
      else url.searchParams.delete("q")
      window.history.replaceState(null, "", `${url.pathname}${url.search}`)
      return true
    },
    [draft],
  )

  const toggleColumn = useCallback(
    (name: string) => {
      if (!columns.includes(name)) {
        setColumns(ordered([...columns, name]))
        return
      }
      setColumns(columns.filter((n) => n !== name))
      setTableKey((k) => k + 1)
    },
    [columns],
  )

  const resetColumns = useCallback(() => {
    setColumns(ordered(DEFAULT_COLUMNS))
    setTableKey((k) => k + 1)
  }, [])

  const active = useMemo<ActiveScreen | null>(() => {
    if (applied.empty) return null
    const key = normalizeQuery(applied.source)
    const preset = PRESETS.find((p) => normalizeQuery(p.query) === key)
    if (preset) return { kind: "preset", id: preset.id, name: preset.name, description: preset.description }
    const mine = saved.find((s) => normalizeQuery(s.query) === key)
    if (mine) return { kind: "saved", id: mine.id, name: mine.name }
    return null
  }, [applied, saved])

  const error = failed && failed.source === draft ? failed.error : null

  const value = useMemo<ScreenerContextValue>(
    () => ({ rows, draft, setDraft, applied, error, run, active, columns, toggleColumn, resetColumns, tableKey }),
    [rows, draft, applied, error, run, active, columns, toggleColumn, resetColumns, tableKey],
  )

  return <ScreenerContext.Provider value={value}>{children}</ScreenerContext.Provider>
}
