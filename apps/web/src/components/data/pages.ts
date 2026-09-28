/** The page numbers to offer: the first and last, and one either side of the current, with gaps as null. */
export function pageNumbers(page: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i)
  const wanted = new Set([0, count - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < count))
  // Near either end, show enough pages that the row doesn't shrink and jump.
  if (page <= 3) [1, 2, 3, 4].forEach((p) => wanted.add(p))
  if (page >= count - 4) [count - 5, count - 4, count - 3, count - 2].forEach((p) => wanted.add(p))
  const sorted = [...wanted].sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1]! > 1 ? [null, p] : [p]))
}
