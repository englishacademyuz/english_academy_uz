import { describe, expect, it } from 'vitest'
import { toPercentage, averagePercentage, pointsForScore } from '../src/assessment/assessment'

describe('toPercentage', () => {
  it('normalizes a raw score against its own max', () => {
    expect(toPercentage(8, 10)).toBe(80)
    expect(toPercentage(85, 100)).toBe(85)
  })

  it('rejects a non-positive max score', () => {
    expect(() => toPercentage(5, 0)).toThrow()
  })
})

describe('averagePercentage', () => {
  it('normalizes each entry before averaging, so differing scales combine fairly', () => {
    // 8/10 (80%) and 85/100 (85%) should average to 82.5%, not be averaged as raw numbers.
    const result = averagePercentage([
      { score: 8, maxScore: 10 },
      { score: 85, maxScore: 100 },
    ])
    expect(result).toBe(82.5)
  })

  it('returns null for an empty result set', () => {
    expect(averagePercentage([])).toBeNull()
  })
})

describe('pointsForScore', () => {
  it('scales linearly off pointsWorth regardless of the category\'s own grading scale', () => {
    expect(pointsForScore(2, 100, 100)).toBe(2)
    expect(pointsForScore(2, 50, 100)).toBe(1)
    expect(pointsForScore(2, 25, 100)).toBe(1) // rounds 0.5 up
    expect(pointsForScore(2, 3, 5)).toBe(1) // 60% of a 2-point category, rounded down
  })

  it('is 0 when the category doesn\'t feed the Rating ledger', () => {
    expect(pointsForScore(0, 100, 100)).toBe(0)
  })
})
