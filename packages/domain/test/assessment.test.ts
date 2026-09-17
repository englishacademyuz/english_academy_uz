import { describe, expect, it } from 'vitest'
import { toPercentage, averagePercentage } from '../src/assessment/assessment'

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
