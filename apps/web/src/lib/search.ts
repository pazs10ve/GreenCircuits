import { EQUITIES, marketCapCr } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"

/** Lower-case letters and digits only, so "m&m", "M & M" and "bajaj auto" all match. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "")
}

const BY_SIZE = [...EQUITIES].sort((a, b) => marketCapCr(b, b.prevClose) - marketCapCr(a, a.prevClose))
const TEXT = new Map(BY_SIZE.map((e) => [e.id, normalise(`${e.symbol} ${e.name} ${e.sector ?? ""} ${e.industry ?? ""}`)]))

/**
 * Companies for a search box: the largest while nothing is typed, else those
 * whose symbol, name, sector or industry contains what is, largest first.
 * Lists are capped: five hundred rows, each with a live price, are slow to
 * open and to type into.
 */
export function searchCompanies(search: string, { limit = 40, idle = 10, exclude }: { limit?: number; idle?: number; exclude?: readonly number[] } = {}): Instrument[] {
  const needle = normalise(search)
  const pool = exclude?.length ? BY_SIZE.filter((e) => !exclude.includes(e.id)) : BY_SIZE
  if (!needle) return pool.slice(0, idle)
  return pool.filter((e) => TEXT.get(e.id)!.includes(needle)).slice(0, limit)
}
