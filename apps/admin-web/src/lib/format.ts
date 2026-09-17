export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  // Built by hand (dd.MM.yyyy) rather than via Intl -- 'uz-UZ' ICU data is
  // incomplete in some browsers, producing anything from an ugly "M09"
  // month placeholder to a silently reordered ISO-style date. Formatting
  // it ourselves guarantees the same output everywhere.
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${date.getFullYear()}`
}

const UZ_WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
]

// Full weekday/month names spelled out directly rather than via
// Intl's 'uz-UZ' long-form options -- some browsers ship reduced ICU data
// for less common locales and silently fall back to placeholders (see
// formatDate's comment) for exactly this kind of formatting.
export function formatLongDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return `${UZ_WEEKDAYS[date.getDay()]}, ${date.getDate()}-${UZ_MONTHS[date.getMonth()]}, ${date.getFullYear()}`
}

export function toDateInputValue(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toISOString().slice(0, 10)
}

export function todayInputValue(): string {
  return toDateInputValue(new Date())
}

export const studentStatusTone: Record<string, 'green' | 'amber' | 'slate' | 'red'> = {
  ACTIVE: 'green',
  PAUSED: 'amber',
  INACTIVE: 'slate',
  COMPLETED: 'slate',
  LEFT: 'red',
}

export const attendanceStatusTone: Record<string, 'green' | 'red' | 'amber' | 'slate'> = {
  PRESENT: 'green',
  LATE: 'amber',
  ABSENT: 'red',
  EXCUSED: 'slate',
}

// Display labels only -- the underlying values sent to/from the API stay in
// English since they're the backend's enum values (zod/Prisma), not text to translate.
export const studentStatusLabel: Record<string, string> = {
  ACTIVE: 'Faol',
  PAUSED: "Toʻxtatilgan",
  INACTIVE: 'Nofaol',
  COMPLETED: 'Tugallagan',
  LEFT: 'Ketgan',
}

export const attendanceStatusLabel: Record<string, string> = {
  PRESENT: 'Bor',
  LATE: 'Kechikdi',
  ABSENT: "Yoʻq",
  EXCUSED: 'Sababli',
}

export const attendanceStatusShortLabel: Record<string, string> = {
  PRESENT: 'B',
  LATE: 'K',
  ABSENT: 'Y',
  EXCUSED: 'S',
}

export const dayLabel: Record<string, string> = {
  MON: 'Du',
  TUE: 'Se',
  WED: 'Ch',
  THU: 'Pa',
  FRI: 'Ju',
  SAT: 'Sh',
  SUN: 'Ya',
}

export function formatScheduleDays(days: string[]): string {
  return days.map((day) => dayLabel[day] ?? day).join('/')
}

export const materialTypeLabel: Record<string, string> = {
  LINK: 'Havola',
  TEXT: 'Matn',
  PDF: 'PDF',
  DOCUMENT: 'Hujjat',
  IMAGE: 'Rasm',
  VIDEO: 'Video',
  AUDIO: 'Audio',
}

export const homeworkResultStatusLabel: Record<string, string> = {
  COMPLETED: 'Bajarilgan',
  NOT_COMPLETED: 'Bajarilmagan',
}

export const assessmentTypeLabel: Record<string, string> = {
  WEEKLY: 'Haftalik',
  MONTHLY: 'Oylik',
  GENERAL: 'Umumiy',
  CUSTOM: 'Maxsus',
}

export const enrollmentEndReasonLabel: Record<string, string> = {
  GROUP_CHANGE: "Guruh oʻzgardi",
  STUDENT_LEFT: "Oʻquvchi ketdi",
  COMPLETED: 'Tugallandi',
  OTHER: 'Boshqa',
}

export const roleLabel: Record<string, string> = {
  ADMIN: 'Administrator',
  TEACHER: "Oʻqituvchi",
  STUDENT: "Oʻquvchi",
  PARENT: 'Ota-ona',
}
