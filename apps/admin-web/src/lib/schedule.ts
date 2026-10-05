import { toDateInputValue } from './format'
import type { Group, LessonReschedule } from './types'

export const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export function weekdayCode(date: Date): string {
  return WEEKDAY_CODES[date.getDay()]
}

/** Group.scheduleTime is stored as "HH:MM". */
function parseScheduleMinutes(scheduleTime: string): number {
  const [hours, minutes] = scheduleTime.split(':').map(Number)
  return hours * 60 + minutes
}

/** Attendance can't be taken for a lesson that hasn't started yet. */
export function hasLessonStarted(scheduleTime: string, now: Date = new Date()): boolean {
  return now.getHours() * 60 + now.getMinutes() >= parseScheduleMinutes(scheduleTime)
}

/** Reschedule dates are UTC-midnight ISO strings -- their first 10 chars are the calendar day. */
export const dayKeyOf = (iso: string) => iso.slice(0, 10)

/** The local calendar day an ISO day key names, at local midnight. */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** One lesson on the calendar: a regular one, or one moved onto this day (or to another time on it). */
export type Occurrence = {
  group: Group
  time: string
  reschedule?: LessonReschedule
}

/** A regular lesson that won't happen on this day because it was moved elsewhere. */
export type MovedAway = { group: Group; reschedule: LessonReschedule }

/**
 * What actually happens on `day`: the regular weekly schedule with every
 * reschedule applied -- lessons moved away are listed separately (the
 * timetable still shows their empty slot), lessons moved in are added.
 */
export function lessonsOnDay(groups: Group[], reschedules: LessonReschedule[], day: Date) {
  const key = toDateInputValue(day)
  const byGroup = new Map(groups.map((g) => [g.id, g]))
  const lessons: Occurrence[] = []
  const movedAway: MovedAway[] = []

  for (const group of groups) {
    if (!group.scheduleDays.includes(weekdayCode(day))) continue
    const moved = reschedules.find((r) => r.groupId === group.id && dayKeyOf(r.originalDate) === key)
    if (!moved) lessons.push({ group, time: group.scheduleTime })
    else if (dayKeyOf(moved.newDate) !== key) movedAway.push({ group, reschedule: moved })
  }
  for (const r of reschedules) {
    const group = byGroup.get(r.groupId)
    if (group && dayKeyOf(r.newDate) === key) lessons.push({ group, time: r.newTime, reschedule: r })
  }

  lessons.sort((a, b) => a.time.localeCompare(b.time))
  return { lessons, movedAway }
}

/**
 * The group's first lesson after the day `afterKey` (a yyyy-mm-dd key), with reschedules
 * applied -- the default deadline for homework set that day. Looks up to five weeks ahead;
 * null when the group has no lesson in that time.
 */
export function nextLessonKey(group: Group, reschedules: LessonReschedule[], afterKey: string): string | null {
  const day = dateFromKey(afterKey)
  for (let i = 0; i < 35; i++) {
    day.setDate(day.getDate() + 1)
    if (lessonsOnDay([group], reschedules, day).lessons.length > 0) return toDateInputValue(day)
  }
  return null
}
