export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Tile<T> extends Rect {
  item: T
}

/**
 * A squarified treemap (Bruls, Huizing and van Wijk): the items, largest
 * first, laid in rows along the shorter side of what's left, each row kept
 * as close to square tiles as it can be. Every tile's area is its share of
 * the total; items worth nothing are left out.
 */
export function squarify<T>(items: T[], value: (item: T) => number, rect: Rect): Tile<T>[] {
  const sorted = items.filter((t) => value(t) > 0).sort((a, b) => value(b) - value(a))
  const total = sorted.reduce((s, t) => s + value(t), 0)
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return []
  const scale = (rect.w * rect.h) / total
  const out: Tile<T>[] = []
  let { x, y, w, h } = rect

  // How far from square the row's worst tile is, laid along a side of this length.
  const worst = (row: T[], side: number) => {
    const areas = row.map((t) => value(t) * scale)
    const sum = areas.reduce((s, a) => s + a, 0)
    const max = Math.max(...areas)
    const min = Math.min(...areas)
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
  }

  const place = (row: T[]) => {
    const areas = row.map((t) => value(t) * scale)
    const sum = areas.reduce((s, a) => s + a, 0)
    if (w >= h) {
      // A column down the left of what's left.
      const width = sum / h
      let top = y
      row.forEach((t, i) => {
        const height = areas[i]! / width
        out.push({ x, y: top, w: width, h: height, item: t })
        top += height
      })
      x += width
      w -= width
    } else {
      // A row along the top.
      const height = sum / w
      let left = x
      row.forEach((t, i) => {
        const width = areas[i]! / height
        out.push({ x: left, y, w: width, h: height, item: t })
        left += width
      })
      y += height
      h -= height
    }
  }

  let row: T[] = []
  for (const item of sorted) {
    const side = Math.min(w, h)
    if (row.length === 0 || worst([...row, item], side) <= worst(row, side)) row.push(item)
    else {
      place(row)
      row = [item]
    }
  }
  if (row.length) place(row)
  return out
}
