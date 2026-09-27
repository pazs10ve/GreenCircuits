"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { RunDetail, RunSummary } from "@greencircuits/contracts/lab"
import type { BacktestRequest } from "@greencircuits/contracts/strategy"
import { useMarket } from "@/lib/stream/market-context"
import { sessionReady } from "@/lib/stores/remote"

/**
 * The lab's backend: backtests are queued with the API, run by the Python
 * workers, and read back by id. Only in live mode; in demo mode the lab
 * explains that the backend is off.
 */

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

export function useLabAvailable(): boolean {
  return useMarket().mode === "live"
}

/** Your recent tests, refreshed while any of them is still running. */
export function useRuns() {
  const live = useLabAvailable()
  return useQuery({
    queryKey: ["lab", "runs"],
    queryFn: async () => (await api<{ runs: RunSummary[] }>("/me/backtests")).runs,
    enabled: live,
    refetchInterval: (q) => (q.state.data?.some((r) => busy(r.status)) ? 2000 : false),
  })
}

/** One test, polled every second until it finishes. */
export function useRun(id: string | null) {
  const live = useLabAvailable()
  return useQuery({
    queryKey: ["lab", "run", id],
    queryFn: () => api<RunDetail>(`/me/backtests/${id}`),
    enabled: live && !!id,
    retry: (count, err) => !(err instanceof LabError && err.status === 404) && count < 2,
    refetchInterval: (q) => (busy(q.state.data?.run.status) ? 1000 : false),
  })
}

export function useSubmitRun() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (request: BacktestRequest) => {
      // The first request of a visit creates the anonymous account; let that finish first
      // so this one doesn't create a second. Don't wait forever if the sync is stuck.
      await Promise.race([sessionReady(), new Promise((r) => setTimeout(r, 3000))])
      return api<{ runId: string; status: string; cached: boolean }>("/me/backtests", { method: "POST", body: JSON.stringify(request) })
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["lab", "runs"] }),
  })
}

export function useDeleteRun() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<null>(`/me/backtests/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      client.setQueryData<RunSummary[]>(["lab", "runs"], (runs) => runs?.filter((r) => r.id !== id))
      client.removeQueries({ queryKey: ["lab", "run", id] })
    },
  })
}
