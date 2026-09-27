/**
 * Server-side access to the GreenCircuits API. When API_URL isn't set, or the
 * API doesn't answer quickly, callers get null and fall back to the demo
 * generators, so the site still works as a frontend-only deploy.
 */

export const API_URL = process.env.API_URL?.replace(/\/$/, "")
export const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL

export async function apiGet<T>(path: string, { revalidate = 30, timeoutMs = 2500 }: { revalidate?: number | false; timeoutMs?: number } = {}): Promise<T | null> {
  if (!API_URL) return null
  try {
    const res = await fetch(`${API_URL}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      ...(revalidate === false ? { cache: "no-store" as const } : { next: { revalidate } }),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** 'YYYY-MM-DD' (an IST date) → a Date at noon IST, safe to format in any timezone. */
export function istNoon(date: string): Date {
  return new Date(`${date}T06:30:00Z`)
}
