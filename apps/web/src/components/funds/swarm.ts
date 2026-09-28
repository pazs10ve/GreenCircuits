/** Lanes a dot may take, nearest the middle first: 0 is the middle, negative above it. */
export const LANES = [0, -1, 1, -2, 2, -3, 3] as const

/**
 * A light beeswarm: dots in order along a line, each in the first lane with
 * room, so a crowd spreads up and down instead of piling up. Positions run 0
 * to 1 and come sorted; `gap` is how close two dots in one lane may come.
 * When every lane is full, a dot joins the lane that has been free longest.
 */
export function swarm(xs: number[], gap: number, lanes: readonly number[] = LANES): number[] {
  const last = new Map<number, number>()
  return xs.map((x) => {
    const lane = lanes.find((l) => (last.get(l) ?? -Infinity) < x - gap) ?? lanes.reduce((a, b) => (last.get(a)! <= last.get(b)! ? a : b))
    last.set(lane, x)
    return lane
  })
}
