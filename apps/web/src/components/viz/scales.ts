/** Small scale helpers for the hand-drawn SVG charts. */

export interface Pt {
  /** Unix seconds. */
  t: number
  v: number
}

/** Round, human tick values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo
  if (!(span > 0)) return [lo]
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const err = raw / mag
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) ticks.push(Number(v.toPrecision(12)))
  return ticks
}

const IST = 5.5 * 3600

function ist(t: number): Date {
  return new Date((t + IST) * 1000)
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]

/**
 * Calendar-aligned time ticks in IST: hours for a session, days for a week,
 * months for a year, years beyond that. Returns at most `max` ticks.
 */
export function timeTicks(points: Pt[], max = 6): { t: number; label: string }[] {
  if (points.length < 2) return []
  const t0 = points[0]!.t
  const t1 = points.at(-1)!.t
  const span = t1 - t0
  const out: { t: number; label: string }[] = []
  const keyOf = (t: number): [string, string] | null => {
    const d = ist(t)
    if (span <= 1.2 * 86400) {
      // Whole hours within the session.
      if (d.getUTCMinutes() !== 0) return null
      return [`${d.getUTCHours()}`, `${String(d.getUTCHours()).padStart(2, "0")}:00`]
    }
    if (span <= 12 * 86400) return [`${d.getUTCMonth()}-${d.getUTCDate()}`, `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`]
    if (span <= 400 * 86400) {
      return [`${d.getUTCFullYear()}-${d.getUTCMonth()}`, d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : MONTHS[d.getUTCMonth()]!]
    }
    return [`${d.getUTCFullYear()}`, String(d.getUTCFullYear())]
  }
  // Ticks sit on boundaries crossed inside the range; the partial first period gets none.
  let prevKey = keyOf(t0)?.[0] ?? ""
  for (const p of points) {
    const k = keyOf(p.t)
    if (!k || k[0] === prevKey) continue
    out.push({ t: p.t, label: k[1] })
    prevKey = k[0]
  }
  if (out.length <= max) return out
  const stride = Math.ceil(out.length / max)
  return out.filter((_, i) => i % stride === 0)
}

/** Keep the shape of a long series at a given pixel width: min and max per bucket, in time order. */
export function downsample(points: Pt[], buckets: number): Pt[] {
  if (points.length <= buckets * 2 || buckets < 2) return points
  const size = points.length / buckets
  const out: Pt[] = [points[0]!]
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size)
    const end = Math.min(points.length, Math.floor((b + 1) * size))
    let lo = points[start]!
    let hi = points[start]!
    for (let i = start; i < end; i++) {
      const p = points[i]!
      if (p.v < lo.v) lo = p
      if (p.v > hi.v) hi = p
    }
    if (lo.t <= hi.t) out.push(lo, hi)
    else out.push(hi, lo)
  }
  out.push(points.at(-1)!)
  return out
}

/** Index of the point nearest to time t (points sorted by t). */
export function nearestIndex(points: Pt[], t: number): number {
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid]!.t < t) lo = mid
    else hi = mid
  }
  return Math.abs(points[lo]!.t - t) <= Math.abs(points[hi]!.t - t) ? lo : hi
}

export function linePath(points: Pt[], x: (t: number) => number, y: (v: number) => number): string {
  let d = ""
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    d += `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`
  }
  return d
}

/**
 * A smooth line through the points that never overshoots them (monotone cubic, after Fritsch and Carlson):
 * a small trend line reads as a shape rather than a scribble, and every point stays where it was.
 */
export function monotonePath(points: readonly (readonly [number, number])[]): string {
  const n = points.length
  const f = (v: number) => v.toFixed(1)
  if (n < 3) return points.map(([x, y], i) => `${i ? "L" : "M"}${f(x)},${f(y)}`).join("")
  const h: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1]![0] - points[i]![0] || 1e-9
    h.push(dx)
    m.push((points[i + 1]![1] - points[i]![1]) / dx)
  }
  const t: number[] = [m[0]!]
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1]! * m[i]! <= 0) t.push(0)
    else {
      const w1 = 2 * h[i]! + h[i - 1]!
      const w2 = h[i]! + 2 * h[i - 1]!
      t.push((w1 + w2) / (w1 / m[i - 1]! + w2 / m[i]!))
    }
  }
  t.push(m[n - 2]!)
  let d = `M${f(points[0]![0])},${f(points[0]![1])}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!
    const [x1, y1] = points[i + 1]!
    const k = h[i]! / 3
    d += `C${f(x0 + k)},${f(y0 + t[i]! * k)},${f(x1 - k)},${f(y1 - t[i + 1]! * k)},${f(x1)},${f(y1)}`
  }
  return d
}
