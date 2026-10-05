import { describe, expect, it } from 'vitest'
import { deadlineLabel, endOfStoredDay, homeworkDeadline, timeLeft, urgencyOf } from '../src/student/deadline'

const HOUR = 3_600_000

describe('urgencyOf', () => {
  const now = new Date('2026-10-05T10:00:00Z')
  const inHours = (h: number) => new Date(now.getTime() + h * HOUR)

  it('gets louder as the deadline nears', () => {
    expect(urgencyOf(inHours(30), now)).toBe('later')
    expect(urgencyOf(inHours(23.9), now)).toBe('soon')
    expect(urgencyOf(inHours(2.9), now)).toBe('hot')
    expect(urgencyOf(inHours(-0.1), now)).toBe('overdue')
  })
})

describe('homeworkDeadline', () => {
  const now = new Date('2026-10-05T10:00:00Z')

  it("counts a homework's own due day to 23:59 in Tashkent", () => {
    expect(endOfStoredDay('2026-10-07T00:00:00.000Z').toISOString()).toBe('2026-10-07T18:59:00.000Z')
    expect(homeworkDeadline('2026-10-07T00:00:00.000Z', [], now)).toEqual({
      at: new Date('2026-10-07T18:59:00.000Z'),
      task: null,
    })
  })

  it('picks the soonest picture task still ahead, named by its title or number', () => {
    const images = [
      { title: 'Listening', dueDate: '2026-10-06T13:00:00.000Z' },
      { title: null, dueDate: '2026-10-05T15:00:00.000Z' },
      { title: 'Old', dueDate: '2026-10-04T13:00:00.000Z' },
    ]
    expect(homeworkDeadline(null, images, now)).toEqual({ at: new Date('2026-10-05T15:00:00.000Z'), task: '2-vazifa' })
  })

  it('falls back to the last deadline once all have passed, and to null when there are none', () => {
    const images = [
      { title: 'A', dueDate: '2026-10-03T13:00:00.000Z' },
      { title: 'B', dueDate: '2026-10-04T13:00:00.000Z' },
    ]
    expect(homeworkDeadline(null, images, now)?.task).toBe('B')
    expect(homeworkDeadline(null, [{ title: 'A', dueDate: null }], now)).toBeNull()
  })
})

describe('deadlineLabel and timeLeft', () => {
  // Local times, so the labels hold in any time zone the tests run in.
  const now = new Date(2026, 9, 5, 10, 0)

  it('says today, tomorrow or the weekday, with the time', () => {
    expect(deadlineLabel(new Date(2026, 9, 5, 18, 0), now)).toBe('Bugun 18:00 gacha')
    expect(deadlineLabel(new Date(2026, 9, 6, 9, 30), now)).toBe('Ertaga 09:30 gacha')
    expect(deadlineLabel(new Date(2026, 9, 7, 18, 0), now)).toBe('Chorshanba, 7-oktabr, 18:00 gacha')
  })

  it('counts down in the largest units that matter', () => {
    expect(timeLeft(new Date(2026, 9, 5, 12, 15), now)).toBe('2 soat 15 daqiqa')
    expect(timeLeft(new Date(2026, 9, 5, 10, 45), now)).toBe('45 daqiqa')
    expect(timeLeft(new Date(2026, 9, 5, 13, 0), now)).toBe('3 soat')
    expect(timeLeft(new Date(2026, 9, 8, 14, 0), now)).toBe('3 kun 4 soat')
    expect(timeLeft(new Date(2026, 9, 5, 10, 0, 30), now)).toBe('1 daqiqadan kam')
  })
})
