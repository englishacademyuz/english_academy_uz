import { describe, expect, it } from 'vitest'
import { nextLessonAfter } from '../src/lib/schedule'
import type { Group, LessonReschedule } from '../src/lib/types'

// Mondays and Wednesdays at 18:00. 2026-10-05 is a Monday.
const group = { id: 'g1', scheduleDays: ['MON', 'WED'], scheduleTime: '18:00' } as Group

const moved = (originalDate: string, newDate: string, newTime = '18:00'): LessonReschedule => ({
  id: 'r1',
  groupId: 'g1',
  originalDate: `${originalDate}T00:00:00.000Z`,
  newDate: `${newDate}T00:00:00.000Z`,
  newTime,
  reason: null,
  notifiedAt: null,
})

describe('nextLessonAfter', () => {
  it("finds the group's next regular lesson after the given day, with its time", () => {
    expect(nextLessonAfter(group, [], '2026-10-05')).toEqual({ day: '2026-10-07', time: '18:00' })
    expect(nextLessonAfter(group, [], '2026-10-07')).toEqual({ day: '2026-10-12', time: '18:00' })
  })

  it('follows a lesson that was moved, to its new time', () => {
    // Wednesday's lesson moved to Thursday at 15:30.
    expect(nextLessonAfter(group, [moved('2026-10-07', '2026-10-08', '15:30')], '2026-10-05')).toEqual({
      day: '2026-10-08',
      time: '15:30',
    })
  })

  it('gives up when the group has no lessons', () => {
    expect(nextLessonAfter({ ...group, scheduleDays: [] }, [], '2026-10-05')).toBeNull()
  })
})
