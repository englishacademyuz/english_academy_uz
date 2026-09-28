import type { AttendanceStatus } from '../lib/types'
import type { Tone } from './components/kit'
import type { GroupSummary } from './types'

export { formatDate, formatLongDate, formatMonthLong } from '../lib/format'

const DAY_NAMES: Record<string, string> = {
  MON: 'Dushanba',
  TUE: 'Seshanba',
  WED: 'Chorshanba',
  THU: 'Payshanba',
  FRI: 'Juma',
  SAT: 'Shanba',
  SUN: 'Yakshanba',
}

/** "Dushanba / Chorshanba / Juma, 18:00" */
export function formatSchedule(group: GroupSummary): string {
  return `${group.scheduleDays.map((d) => DAY_NAMES[d] ?? d).join(' / ')}, ${group.scheduleTime}`
}

/** A rate as "85%", or null when there's nothing to measure yet (never a misleading 0%). */
export function percent(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : `${Math.round(value)}%`
}

export function rateTone(value: number | null): Tone {
  if (value === null) return 'slate'
  if (value >= 80) return 'green'
  if (value >= 60) return 'amber'
  return 'red'
}

/** Average across categories -- the "academic" figure for a period. */
export function averageOf(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
}

export const ATTENDANCE: Record<AttendanceStatus, { label: string; icon: string; tone: Tone }> = {
  PRESENT: { label: 'Bor', icon: '✅', tone: 'green' },
  LATE: { label: 'Kechikdi', icon: '🟡', tone: 'amber' },
  ABSENT: { label: 'Yoʻq', icon: '❌', tone: 'red' },
  EXCUSED: { label: 'Sababli', icon: '🔵', tone: 'blue' },
}

/** Deadline in the viewer's local time, e.g. "28.09.2026, 23:59". */
export function formatDateTime(value: string): string {
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
