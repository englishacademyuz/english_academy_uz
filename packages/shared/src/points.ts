// Pure point math, shared by the server and the admin panel (which previews it
// while an admin sets up an assessment category) -- so no dependencies here.

/** Rating points move in half-point steps: a result is worth 7.5 points, never 7.25 or 7.3. */
export function roundPoints(value: number): number {
  return Math.round(value * 2) / 2
}

export function isWholeOrHalf(value: number): boolean {
  return Number.isInteger(value * 2)
}

/** A `percentage` (0-100) result's share of the `pointsWorth` a 100% result earns, in half-point steps. */
export function pointsForPercentage(pointsWorth: number, percentage: number): number {
  return roundPoints((pointsWorth * percentage) / 100)
}
