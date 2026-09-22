export type TimeframeKind = 'week' | 'month' | 'all'

export const TIMEFRAME_LABEL: Record<TimeframeKind, string> = {
  week: 'Bu hafta',
  month: 'Bu oy',
  all: 'Barcha vaqt',
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const daysSinceMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - daysSinceMonday)
  return d
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/** `null` means no filtering -- all-time. */
export function getTimeframeRange(kind: TimeframeKind): { start: Date; end: Date } | null {
  if (kind === 'all') return null
  const now = new Date()
  return { start: kind === 'week' ? startOfWeek(now) : startOfMonth(now), end: now }
}

export function isWithinRange(date: Date, range: { start: Date; end: Date } | null): boolean {
  if (!range) return true
  return date >= range.start && date <= range.end
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** A lesson can't be recorded before it happens -- attendance/marks stay editable for today and
 * any past day, but never for a date still ahead of "now". */
export function isFutureDay(date: Date, now: Date = new Date()): boolean {
  return !isSameDay(date, now) && date.getTime() > now.getTime()
}
