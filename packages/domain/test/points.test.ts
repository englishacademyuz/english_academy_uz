import { describe, expect, it } from 'vitest'
import { sumPoints } from '../src/points/points'

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
