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
