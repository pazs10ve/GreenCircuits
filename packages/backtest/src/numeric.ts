/**
 * Arithmetic that matches the Python engine's to the last bit where it
 * reasonably can: NumPy's pairwise summation, Python's round-half-even, and
 * NumPy's two-pass standard deviation. The golden-file tests compare the two
 * engines, and these keep the differences at rounding noise.
 */

/** NumPy's `np.sum` for a contiguous float64 array: pairwise, 8 accumulators, blocks of 128. */
export function npSum(a: ArrayLike<number>, lo = 0, n = a.length - lo): number {
  if (n < 8) {
    let res = -0
    for (let i = 0; i < n; i++) res += a[lo + i]!
    return res
  }
  if (n <= 128) {
    const r = [a[lo]!, a[lo + 1]!, a[lo + 2]!, a[lo + 3]!, a[lo + 4]!, a[lo + 5]!, a[lo + 6]!, a[lo + 7]!]
    let i = 8
    for (; i < n - (n % 8); i += 8) {
      for (let j = 0; j < 8; j++) r[j] = r[j]! + a[lo + i + j]!
    }
    let res = r[0]! + r[1]! + (r[2]! + r[3]!) + (r[4]! + r[5]! + (r[6]! + r[7]!))
    for (; i < n; i++) res += a[lo + i]!
    return res
  }
  let n2 = Math.floor(n / 2)
  n2 -= n2 % 8
  return npSum(a, lo, n2) + npSum(a, lo + n2, n - n2)
}

export function npMean(a: ArrayLike<number>): number {
  return npSum(a) / a.length
}

/** `np.std(a, ddof=1)`: the mean first, then the squared deviations. */
export function npStd1(a: ArrayLike<number>): number {
  const mean = npSum(a) / a.length
  const sq = new Float64Array(a.length)
  for (let i = 0; i < a.length; i++) {
    const x = a[i]! - mean
    sq[i] = x * x
  }
  return Math.sqrt(npSum(sq) / Math.max(a.length - 1, 0))
}

/**
 * Python's `round(x, digits)`: the nearest decimal to the double's exact value, ties to even.
 * `toFixed` is exact too but sends ties up; ties only happen for multiples of 1/8 at two
 * decimals (and are vanishingly rare at six), so those are the ones corrected here.
 */
export function pyRound(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x
  const scale = 10 ** digits
  const scaled = x * scale
  if (digits === 2 && Number.isInteger(x * 8) && Math.abs(scaled % 1) === 0.5) {
    const down = Math.floor(scaled)
    return (down % 2 === 0 ? down : down + 1) / scale
  }
  return Number(x.toFixed(digits))
}
