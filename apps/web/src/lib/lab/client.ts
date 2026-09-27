"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { RunDetail, RunSummary } from "@greencircuits/contracts/lab"
import type { BacktestRequest } from "@greencircuits/contracts/strategy"
import { useMarket } from "@/lib/stream/market-context"
import { sessionReady } from "@/lib/stores/remote"
import { runInBrowser, summaryOf, useLocalRuns, useLocalRunsReady } from "./local"

/**
 * Where the lab's tests run. In live mode they're queued with the API and run
 * by the Python workers; in demo mode the TypeScript engine runs them in the
 * browser and keeps them there. The hooks look the same either way.
 */

export type LabMode = "server" | "browser"

export function useLabMode(): LabMode {
  return useMarket().mode === "live" ? "server" : "browser"
}

export class LabError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null
    throw new LabError(body?.message ?? `The server answered ${res.status}.`, res.status)
  }
  return (res.status === 204 ? null : await res.json()) as T
}

const busy = (status: string | undefined) => status === "QUEUED" || status === "RUNNING"

/** Your recent tests, newest first; refreshed while any of them is still running on the server. */
export function useRuns(): { data: RunSummary[] | undefined; isPending: boolean; isError: boolean } {
  const mode = useLabMode()
  const query = useQuery({
    queryKey: ["lab", "runs"],
    queryFn: async () => (await api<{ runs: RunSummary[] }>("/me/backtests")).runs,
    enabled: mode === "server",
    refetchInterval: (q) => (q.state.data?.some((r) => busy(r.status)) ? 2000 : false),
  })
  const local = useLocalRuns((s) => s.runs)
  const ready = useLocalRunsReady()
  if (mode === "server") return { data: query.data, isPending: query.isPending, isError: query.isError }
  return { data: ready ? local.map(summaryOf) : undefined, isPending: !ready, isError: false }
}

/** One test; on the server it's polled every second until it finishes. */
export function useRun(id: string | null): { data: RunDetail | undefined; error: Error | null; isPending: boolean; isError: boolean } {
  const mode = useLabMode()
  const query = useQuery({
    queryKey: ["lab", "run", id],
    queryFn: () => api<RunDetail>(`/me/backtests/${id}`),
    enabled: mode === "server" && !!id,
    retry: (count, err) => !(err instanceof LabError && err.status === 404) && count < 2,
    refetchInterval: (q) => (busy(q.state.data?.run.status) ? 1000 : false),
  })
  const local = useLocalRuns((s) => s.runs.find((r) => r.run.id === id))
  const ready = useLocalRunsReady()
  if (mode === "server") return { data: query.data, error: query.error, isPending: query.isPending, isError: query.isError }
  const missing = ready && !local
  return { data: local, error: missing ? new LabError("No such test", 404) : null, isPending: !ready, isError: missing }
}

export function useSubmitRun() {
  const mode = useLabMode()
  const client = useQueryClient()
  const add = useLocalRuns((s) => s.add)
  return useMutation({
    mutationFn: async (request: BacktestRequest): Promise<{ runId: string; cached: boolean }> => {
      if (mode === "browser") {
        // Let the button show that it's working before the engine takes the main thread.
        await new Promise((r) => setTimeout(r, 30))
        const detail = runInBrowser(request)
        add(detail)
        return { runId: detail.run.id, cached: false }
      }
      // The first request of a visit creates the anonymous account; let that finish first
      // so this one doesn't create a second. Don't wait forever if the sync is stuck.
      await Promise.race([sessionReady(), new Promise((r) => setTimeout(r, 3000))])
      return api<{ runId: string; cached: boolean }>("/me/backtests", { method: "POST", body: JSON.stringify(request) })
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["lab", "runs"] }),
  })
}

export function useDeleteRun() {
  const mode = useLabMode()
  const client = useQueryClient()
  const remove = useLocalRuns((s) => s.remove)
  return useMutation({
    mutationFn: async (id: string) => {
      if (mode === "browser") return remove(id)
      await api<null>(`/me/backtests/${id}`, { method: "DELETE" })
    },
    onSuccess: (_data, id) => {
      client.setQueryData<RunSummary[]>(["lab", "runs"], (runs) => runs?.filter((r) => r.id !== id))
      client.removeQueries({ queryKey: ["lab", "run", id] })
    },
  })
}
