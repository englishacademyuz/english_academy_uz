import type { AttendanceStatus } from '../lib/types'

export { formatDate, formatWeekRange } from '../lib/format'

/**
 * Marks are stored as score/maxScore, but children and parents read a
 * 5-point school grade. A percentage maps onto it with the usual Uzbek
 * bands: 86–100 → 5, 71–85 → 4, 56–70 → 3, below → 2.
 */
export type Grade = 5 | 4 | 3 | 2

export function gradeOf(percent: number | null | undefined): Grade | null {
  if (percent === null || percent === undefined) return null
  if (percent >= 86) return 5
  if (percent >= 71) return 4
  if (percent >= 56) return 3
  return 2
}

/** How each grade is said and painted -- the design's word, text/surface colors and smiley. */
export const GRADE: Record<Grade, { word: string; dark: string; light: string; face: string; mouth: string; mouthFill: string }> = {
  5: { word: 'Ajoyib', dark: '#1B6B2C', light: '#E3F7E6', face: '#8CE99A', mouth: 'M6.8 13.2c1.4 4 9 4 10.4 0z', mouthFill: '#1F2A44' },
  4: { word: 'Zoʻr', dark: '#2F4AC0', light: '#E6ECFF', face: '#91A7FF', mouth: 'M8 14c1.3 2 6.7 2 8 0', mouthFill: 'none' },
  3: { word: 'Qoniqarli', dark: '#8A5A00', light: '#FFF3BF', face: '#FFD43B', mouth: 'M8.5 15h7', mouthFill: 'none' },
  2: { word: 'Yomon', dark: '#B42318', light: '#FFE3E3', face: '#FFA8A8', mouth: 'M8 16.5c1.3-2 6.7-2 8 0', mouthFill: 'none' },
}

export function averageOf(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
}

export function percentOf(score: number, maxScore: number): number | null {
  return maxScore > 0 ? (score / maxScore) * 100 : null
}

/** What a day's attendance says, in a sentence and a color pair. */
export const ATTENDANCE: Record<AttendanceStatus, { short: string; sentence: string; fg: string; bg: string }> = {
  PRESENT: { short: 'Keldi', sentence: 'Darsga keldi', fg: '#1B6B2C', bg: '#E3F7E6' },
  LATE: { short: 'Kechikdi', sentence: 'Darsga kechikib keldi', fg: '#9A3412', bg: '#FFE8CC' },
  ABSENT: { short: 'Kelmadi', sentence: 'Darsga kelmadi', fg: '#B42318', bg: '#FFE3E3' },
  EXCUSED: { short: 'Sababli', sentence: 'Sababli qoldirdi', fg: '#2F4AC0', bg: '#E6ECFF' },
}

// Spelled out by hand, as lib/format does -- 'uz-UZ' ICU data is unreliable in some browsers.
export const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
/** Two-letter weekday labels, Monday first -- the design's calendar headers. */
export const WEEK_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']
export const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Dushanba · 28 sentabr" -- shown upper-cased above lesson titles. */
export function weekdayDayMonth(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} · ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/** "Chorshanba, 30-sentabr" */
export function weekdayDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()}-${MONTHS[date.getMonth()]}`
}

/** Deadline in the viewer's local time, e.g. "28.09.2026, 23:59". */
export function formatDateTime(value: string): string {
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "Umid Teacher" → "Umid" -- how students address their teacher. */
export const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? fullName

export function initialsOf(first: string, last?: string): string {
  if (last !== undefined) return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
  const parts = first.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

/** What a submission holds, for its "handed in" chip: "2 rasm", "1 ovozli", "2 rasm · 1 ovozli". */
export function submissionContents(submission: { photos: unknown[]; voices: unknown[] }): string {
  const parts = [
    ...(submission.photos.length ? [`${submission.photos.length} rasm`] : []),
    ...(submission.voices.length ? [`${submission.voices.length} ovozli`] : []),
  ]
  return parts.join(' · ')
}
