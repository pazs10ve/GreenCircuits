"use client"

import { toast } from "sonner"
import { useAlerts, type Alert } from "./alerts"
import { usePortfolio, type Holding } from "./portfolio"
import { useWatchlists, type Watchlist } from "./watchlists"

/**
 * Live mode keeps each visitor's watchlists, alerts and portfolio in Postgres
 * through the API (an anonymous account, via a signed cookie). The server
 * wins when it has data; on a first visit, whatever is in this browser is
 * uploaded. After that, local edits are written back as they happen.
 */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  })
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${res.status}`)
  return (res.status === 204 ? null : await res.json()) as T
}

type ServerAlert = Omit<Alert, "createdAt" | "triggeredAt"> & { createdAt: string; triggeredAt?: string }

const revive = (a: ServerAlert): Alert => ({
  ...a,
  createdAt: new Date(a.createdAt),
  triggeredAt: a.triggeredAt ? new Date(a.triggeredAt) : undefined,
})

function debounce(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  return () => {
    clearTimeout(t)
    t = setTimeout(fn, ms)
  }
}

let started = false
let markReady: () => void = () => {}
const ready = new Promise<void>((resolve) => (markReady = resolve))

/** Resolves once the anonymous session exists and the first sync is done. */
export function sessionReady(): Promise<void> {
  return ready
}

export async function startRemoteSync(): Promise<void> {
  if (started) return
  started = true
  const run = async () => {
    // One request creates the anonymous account and its cookie; only then fan out,
    // or concurrent first requests would each create an account.
    await api("/me")
    await Promise.all([syncWatchlists(), syncAlerts(), syncPortfolio()])
    markReady()
  }
  try {
    // Two tabs opened together would both see an empty account and both upload;
    // the lock makes the second wait and adopt what the first saved.
    if (typeof navigator !== "undefined" && "locks" in navigator) await navigator.locks.request("greencircuits-sync", run)
    else await run()
  } catch (err) {
    console.warn("Couldn't sync with the server; changes stay in this browser.", err)
  }
}

// ------------------------------------------------------------------ watchlists

async function syncWatchlists() {
  const adopt = (lists: Watchlist[]) => {
    const { activeId, lists: before } = useWatchlists.getState()
    const index = Math.max(0, before.findIndex((l) => l.id === activeId))
    useWatchlists.setState({ lists, activeId: lists[Math.min(index, lists.length - 1)]?.id ?? "" })
  }
  const push = async () => {
    const lists = useWatchlists.getState().lists.map((l) => ({ name: l.name, ids: l.ids }))
    const res = await api<{ lists: Watchlist[] }>("/me/watchlists", { method: "PUT", body: JSON.stringify({ lists }) })
    lastPushed = res.lists
    adopt(res.lists)
  }
  let lastPushed: Watchlist[] | null = null

  const server = await api<{ lists: Watchlist[] }>("/me/watchlists")
  if (server.lists.length) {
    lastPushed = server.lists
    adopt(server.lists)
  } else {
    await push()
  }
  const schedule = debounce(() => void push().catch(() => toast.error("Couldn't save your watchlists")), 700)
  useWatchlists.subscribe((state, prev) => {
    if (state.lists !== prev.lists && state.lists !== lastPushed) schedule()
  })
}

// ---------------------------------------------------------------------- alerts

/**
 * What the server holds, by id: the baseline local edits are diffed against.
 * Everything that comes from the server goes through adoptAlerts, so an id
 * missing here is always an alert made in this browser, never a server one.
 */
const syncedAlerts = new Map<string, Alert>()
/** Local alerts being created on the server now, so a second change can't post them twice. */
const posting = new Set<string>()
let applyingAlerts = false

function adoptAlerts(alerts: Alert[]) {
  syncedAlerts.clear()
  for (const a of alerts) syncedAlerts.set(a.id, a)
  applyingAlerts = true
  useAlerts.setState({ alerts })
  applyingAlerts = false
}

const alertBody = (a: Alert) =>
  JSON.stringify({ instrumentId: a.instrumentId, condition: a.condition, value: a.value, channels: a.channels, repeat: a.repeat, note: a.note })

async function syncAlerts() {
  const server = await api<{ alerts: ServerAlert[] }>("/me/alerts")
  if (server.alerts.length) {
    adoptAlerts(server.alerts.map(revive))
  } else {
    // First visit: upload what this browser has (the samples, or alerts made before the backend was up).
    const local = useAlerts.getState().alerts.filter((a) => a.status !== "TRIGGERED")
    const created: Alert[] = []
    for (const a of local) {
      const res = await api<{ alert: ServerAlert }>("/me/alerts", { method: "POST", body: alertBody(a) })
      created.push(revive(res.alert))
    }
    adoptAlerts(created)
  }

  useAlerts.subscribe((state) => {
    if (applyingAlerts) return
    void (async () => {
      const next = state.alerts
      const ids = new Set(next.map((a) => a.id))
      for (const [id] of syncedAlerts) {
        if (!ids.has(id)) {
          syncedAlerts.delete(id)
          await api(`/me/alerts/${id}`, { method: "DELETE" }).catch(() => toast.error("Couldn't delete the alert on the server"))
        }
      }
      for (const a of next) {
        const before = syncedAlerts.get(a.id)
        if (!before) {
          if (posting.has(a.id)) continue
          posting.add(a.id)
          const res = await api<{ alert: ServerAlert }>("/me/alerts", { method: "POST", body: alertBody(a) }).catch(() => null)
          posting.delete(a.id)
          if (!res) {
            toast.error("Couldn't save the alert on the server")
            continue
          }
          const saved = revive(res.alert)
          syncedAlerts.set(saved.id, saved)
          applyingAlerts = true
          useAlerts.setState({ alerts: useAlerts.getState().alerts.map((x) => (x.id === a.id ? saved : x)) })
          applyingAlerts = false
        } else if (before.status !== a.status && (a.status === "ACTIVE" || a.status === "PAUSED")) {
          syncedAlerts.set(a.id, a)
          await api(`/me/alerts/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: a.status }) }).catch(() => toast.error("Couldn't update the alert"))
        }
      }
    })()
  })
}

/** Re-read alerts after the server fires one, so statuses and trigger prices show up. */
export async function refreshAlerts(): Promise<void> {
  const server = await api<{ alerts: ServerAlert[] }>("/me/alerts")
  adoptAlerts(server.alerts.map(revive))
}

// ------------------------------------------------------------------- portfolio

async function syncPortfolio() {
  let lastPushed: Holding[] | null = null
  const server = await api<{ holdings: Holding[] }>("/me/portfolio")
  if (server.holdings.length) {
    lastPushed = server.holdings
    usePortfolio.setState({ holdings: server.holdings, source: "own" })
  } else if (usePortfolio.getState().source === "own") {
    const holdings = usePortfolio.getState().holdings
    await api("/me/portfolio", { method: "PUT", body: JSON.stringify({ holdings }) })
    lastPushed = holdings
  }
  usePortfolio.subscribe((state, prev) => {
    if (state.holdings === prev.holdings || state.holdings === lastPushed) return
    // Back to the sample portfolio clears the server copy; the reader's own holdings replace it.
    const holdings = state.source === "own" ? state.holdings : []
    lastPushed = state.holdings
    void api("/me/portfolio", { method: "PUT", body: JSON.stringify({ holdings }) }).catch(() => toast.error("Couldn't save your portfolio"))
  })
}
