/**
 * How far a price usually moves in a day, in per cent: the spread (standard
 * deviation) of its daily changes, taken as log returns. Null with fewer than
 * twenty changes, too few to say.
 */
export function usualDailyMove(closes: number[]): number | null {
  const changes = closes.slice(1).map((c, i) => Math.log(c / closes[i]!))
  if (changes.length < 20) return null
  const mean = changes.reduce((s, c) => s + c, 0) / changes.length
  return Math.sqrt(changes.reduce((s, c) => s + (c - mean) ** 2, 0) / (changes.length - 1)) * 100
}
