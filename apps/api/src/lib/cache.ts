import type { Redis } from "ioredis"

/**
 * Cache-first reads: return the cached JSON for `key`, or compute it, store it
 * for `ttlSeconds` and return it. If Valkey is unavailable the value is simply
 * computed, so a cache outage slows the API down instead of taking it down.
 */
export async function cached<T>(valkey: Redis, key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  try {
    const hit = await valkey.get(key)
    if (hit) return JSON.parse(hit) as T
  } catch {
    return compute()
  }
  const value = await compute()
  valkey.set(key, JSON.stringify(value), "EX", ttlSeconds).catch(() => {})
  return value
}
