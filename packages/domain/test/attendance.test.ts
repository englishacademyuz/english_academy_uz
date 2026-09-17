import { describe, expect, it } from 'vitest'
import { calculateAttendanceRate } from '../src/attendance/attendance'

describe('calculateAttendanceRate', () => {
  it('credits Present and Late fully, Absent gets no credit', () => {
    const rate = calculateAttendanceRate(['PRESENT', 'PRESENT', 'LATE', 'ABSENT'])
    expect(rate).toBe(75)
  })

  it('excludes Excused from the denominator entirely', () => {
    const withExcused = calculateAttendanceRate(['PRESENT', 'ABSENT', 'EXCUSED'])
    const withoutExcused = calculateAttendanceRate(['PRESENT', 'ABSENT'])
    expect(withExcused).toBe(withoutExcused)
    expect(withExcused).toBe(50)
  })

  it('returns null when there is nothing to compute', () => {
    expect(calculateAttendanceRate([])).toBeNull()
    expect(calculateAttendanceRate(['EXCUSED'])).toBeNull()
  })

  it('returns 100 when every countable record is Present or Late', () => {
    expect(calculateAttendanceRate(['PRESENT', 'LATE'])).toBe(100)
  })
})
