import type { AttendanceStatus } from '@tashkurgan/db'

/**
 * Present/Late count as full attendance credit, Absent counts as zero,
 * Excused is removed from the denominator entirely (requirements §51.1).
 * Returns null when there's nothing to compute a rate from.
 */
export function calculateAttendanceRate(statuses: AttendanceStatus[]): number | null {
  const counted = statuses.filter((status) => status !== 'EXCUSED')
  if (counted.length === 0) return null

  const credited = counted.filter((status) => status === 'PRESENT' || status === 'LATE').length
  return (credited / counted.length) * 100
}
