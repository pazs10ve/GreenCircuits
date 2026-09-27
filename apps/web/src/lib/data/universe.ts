import { cache } from "react"
import { liveGet } from "./market"

/** One instrument's row in GET /v1/market/universe. */
export interface UniverseRow {
  id: number
  /** The last 30 closes, oldest first. */
  spark: number[]
  high52: number
  low52: number
  /** Sessions in the 52-week range (fewer for an instrument with a short history). */
  sessions: number
  /** The first date the database has a price for. */
  since: string
  /** Against the Nifty 50, over the last year. */
  beta: number | null
}

export interface Universe {
  instruments: UniverseRow[]
  /** Trailing EPS by stock id. */
  eps: Record<string, number>
  /** Member ids by index id: only members among the stocks the site follows. */
  members: Record<string, number[]>
}

/** Sparklines, 52-week ranges and index members for the list pages, from the API; null in demo mode. */
export const getUniverse = cache(() => liveGet<Universe>("/v1/market/universe", { revalidate: 60 }))
