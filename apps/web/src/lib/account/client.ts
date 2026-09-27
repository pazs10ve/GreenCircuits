"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Preferences, PublicUser } from "@greencircuits/contracts/account"
import { useMarket } from "@/lib/stream/market-context"
import { sessionReady } from "@/lib/stores/remote"

/**
 * Accounts (ADR 0006). They need the backend, so they exist in live mode only;
 * in demo mode everything stays in this browser. After signing in or out the
 * page reloads, so every store re-syncs with the account it now belongs to.
 */

export class AccountError extends Error {
  constructor(
    message: string,
    readonly code: string,
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
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
    throw new AccountError(body?.message ?? "Something went wrong. Try again in a moment.", body?.error ?? "error", res.status)
  }
  return (res.status === 204 ? null : await res.json()) as T
}

/**
 * A full page load rather than a client-side navigation. After the session changes, every
 * store has to reload from storage and re-sync with the account it now belongs to.
 */
export function reloadInto(path: string): void {
  window.location.assign(path)
}

/** Everything this browser keeps for a visitor. Cleared on sign-out, so the next person starts fresh. */
const STORED = ["gc.alerts", "gc.portfolio", "gc.watchlists", "gc-lab-runs"]

function forgetThisBrowser() {
  for (const key of STORED) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Storage blocked: nothing was kept anyway.
    }
  }
}

export function useAccountsAvailable(): boolean {
  return useMarket().mode === "live"
}

/** The visitor: anonymous until they sign up. Waits for the first sync, which creates the session. */
export function useMe() {
  const available = useAccountsAvailable()
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      await sessionReady()
      return api<PublicUser>("/me")
    },
    enabled: available,
    staleTime: 5 * 60_000,
  })
}

export function useSignIn() {
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api<{ user: PublicUser }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  })
}

export function useSignUp() {
  return useMutation({
    mutationFn: (body: { email: string; password: string; name?: string }) => api<{ user: PublicUser }>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  })
}

/** Signs out, clears what this browser kept, and starts over as a new visitor. */
export async function signOut(): Promise<void> {
  await api("/auth/logout", { method: "POST" }).catch(() => {})
  forgetThisBrowser()
  reloadInto("/")
}

export function useUpdateMe() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: { name?: string; preferences?: Preferences }) => api<PublicUser>("/me", { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: (user) => {
      client.setQueryData(["me"], user)
      void client.invalidateQueries({ queryKey: ["feed"] })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current: string; next: string }) => api<null>("/me/password", { method: "POST", body: JSON.stringify(body) }),
  })
}

export function useSignOutElsewhere() {
  return useMutation({ mutationFn: () => api<null>("/me/sessions", { method: "DELETE" }) })
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (password?: string) => {
      await api<null>("/me", { method: "DELETE", body: JSON.stringify(password ? { password } : {}) })
      forgetThisBrowser()
    },
  })
}

/** Where to go after signing in: only paths on this site, never an address from elsewhere. */
export function safeNext(next: string | null | undefined): string {
  // "//evil.com" and "/\evil.com" are other sites to a browser; only a single leading slash stays here.
  return next && /^\/(?![/\\])/.test(next) ? next : "/"
}
