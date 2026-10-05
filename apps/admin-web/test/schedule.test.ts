import { describe, expect, it } from 'vitest'
import { nextLessonKey } from '../src/lib/schedule'
import type { Group, LessonReschedule } from '../src/lib/types'

// Mondays and Wednesdays at 18:00. 2026-10-05 is a Monday.
const group = { id: 'g1', scheduleDays: ['MON', 'WED'], scheduleTime: '18:00' } as Group

const moved = (originalDate: string, newDate: string): LessonReschedule => ({
  id: 'r1',
  groupId: 'g1',
  originalDate: `${originalDate}T00:00:00.000Z`,
  newDate: `${newDate}T00:00:00.000Z`,
  newTime: '18:00',
  reason: null,
  notifiedAt: null,
})

describe('nextLessonKey', () => {
  it("finds the group's next regular lesson after the given day", () => {
    expect(nextLessonKey(group, [], '2026-10-05')).toBe('2026-10-07')
    expect(nextLessonKey(group, [], '2026-10-07')).toBe('2026-10-12')
  })

  it('follows a lesson that was moved', () => {
    // Wednesday's lesson moved to Thursday.
    expect(nextLessonKey(group, [moved('2026-10-07', '2026-10-08')], '2026-10-05')).toBe('2026-10-08')
  })

  it('gives up when the group has no lessons', () => {
    expect(nextLessonKey({ ...group, scheduleDays: [] }, [], '2026-10-05')).toBeNull()
  })
})
