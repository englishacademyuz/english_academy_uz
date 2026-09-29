import { describe, expect, it } from 'vitest'
import { placesByPoints, sumPoints } from '../src/points/points'

describe('sumPoints', () => {
  it('sums a ledger of transactions', () => {
    expect(sumPoints([{ points: 10 }, { points: 15 }, { points: 20 }])).toBe(45)
  })

  it('allows a negative correction entry to reduce the total', () => {
    // Corrections are appended, never edited in place (§51.3) -- a
    // negative entry is how a mistaken award gets reversed.
    expect(sumPoints([{ points: 20 }, { points: -5 }])).toBe(15)
  })

  it('returns 0 for an empty ledger', () => {
    expect(sumPoints([])).toBe(0)
  })
})

describe('placesByPoints', () => {
  const places = (points: number[]) => placesByPoints(points.map((p) => ({ points: p }))).map((r) => [r.points, r.place])

  it('ranks highest first', () => {
    expect(places([4, 9, 7])).toEqual([[9, 1], [7, 2], [4, 3]])
  })

  it('puts equal points on the same place and gives the next score the next place', () => {
    expect(places([10, 8, 10, 7.5, 8])).toEqual([[10, 1], [10, 1], [8, 2], [8, 2], [7.5, 3]])
  })

  it('handles an empty table', () => {
    expect(places([])).toEqual([])
  })
})
