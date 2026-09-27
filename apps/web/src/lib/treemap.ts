/** Squarified treemap layout (Bruls, Huizing & van Wijk), in the units of the box you pass. */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface TreemapCell<T> extends Rect {
  data: T
}

interface Node<T> {
  area: number
  data: T
}

function worst<T>(row: Node<T>[], side: number): number {
  let sum = 0
  let max = -Infinity
  let min = Infinity
  for (const n of row) {
    sum += n.area
    max = Math.max(max, n.area)
    min = Math.min(min, n.area)
  }
  const s2 = sum * sum
  const side2 = side * side
  return Math.max((side2 * max) / s2, s2 / (side2 * min))
}

export function squarify<T>(items: { value: number; data: T }[], box: Rect): TreemapCell<T>[] {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0)
  if (total <= 0 || box.w <= 0 || box.h <= 0) return []
  const scale = (box.w * box.h) / total
  const nodes = items
    .filter((i) => i.value > 0)
    .map((i) => ({ area: i.value * scale, data: i.data }))
    .sort((a, b) => b.area - a.area)

  const out: TreemapCell<T>[] = []
  let { x, y, w, h } = box

  const place = (row: Node<T>[]) => {
    const sum = row.reduce((s, n) => s + n.area, 0)
    if (w >= h) {
      // Fill a column along the left edge.
      const cw = sum / h
      let cy = y
      for (const n of row) {
        const ch = n.area / cw
        out.push({ x, y: cy, w: cw, h: ch, data: n.data })
        cy += ch
      }
      x += cw
      w -= cw
    } else {
      // Fill a row along the top edge.
      const rh = sum / w
      let cx = x
      for (const n of row) {
        const cw = n.area / rh
        out.push({ x: cx, y, w: cw, h: rh, data: n.data })
        cx += cw
      }
      y += rh
      h -= rh
    }
  }

  let row: Node<T>[] = []
  for (const node of nodes) {
    const side = Math.min(w, h)
    if (row.length === 0 || worst([...row, node], side) <= worst(row, side)) {
      row.push(node)
    } else {
      place(row)
      row = [node]
    }
  }
  if (row.length) place(row)
  return out
}
