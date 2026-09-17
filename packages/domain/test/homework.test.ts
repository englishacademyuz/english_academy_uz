import { describe, expect, it } from 'vitest'
import { calculateHomeworkRate } from '../src/homework/homework'

describe('calculateHomeworkRate', () => {
  it('averages only the graded entries', () => {
    expect(calculateHomeworkRate([90, null, 70])).toBe(80)
  })

  it('returns null when nothing is graded', () => {
    expect(calculateHomeworkRate([null, null])).toBeNull()
    expect(calculateHomeworkRate([])).toBeNull()
  })

  it('does not treat an ungraded completion as zero', () => {
    // A single ungraded entry alongside one graded entry must not drag
    // the average toward zero -- it's excluded, not counted as 0.
    expect(calculateHomeworkRate([100, null])).toBe(100)
  })
})
