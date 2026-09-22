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

export function weekdayName(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return UZ_WEEKDAYS[date.getDay()]
}

export function dayMonthYearLabel(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return `${date.getDate()}-${UZ_MONTHS[date.getMonth()]}, ${date.getFullYear()}`
}

// Full weekday/month names spelled out directly rather than via
// Intl's 'uz-UZ' long-form options -- some browsers ship reduced ICU data
// for less common locales and silently fall back to placeholders (see
// formatDate's comment) for exactly this kind of formatting.
export function formatLongDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return `${weekdayName(date)}, ${dayMonthYearLabel(date)}`
}

export function formatDayMonthWeekday(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return `${date.getDate()}-${UZ_MONTHS[date.getMonth()]}, ${weekdayName(date)}`
}

export function formatTime(value: string | Date, withSeconds = false): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  if (!withSeconds) return `${h}:${m}`
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function formatDayMonth(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}`
}

export function toDateInputValue(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  // Built from local date parts rather than `.toISOString()` -- ISO conversion
  // goes through UTC, which shifts a local midnight (e.g. a constructed month
  // boundary) back a calendar day in any timezone ahead of UTC.
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

export const assessmentCategoryCadenceLabel: Record<string, string> = {
  DAILY: 'Kunlik',
  WEEKLY: 'Haftalik',
  MONTHLY: 'Oylik',
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

export const paymentStatusLabel: Record<string, string> = {
  DEBT: 'Qarzdor',
  PARTIAL: "Qisman toʻlangan",
  PAID: "Toʻlangan",
}

export const paymentStatusTone: Record<string, 'green' | 'amber' | 'slate' | 'red'> = {
  DEBT: 'red',
  PARTIAL: 'amber',
  PAID: 'green',
}

export const pointActivityTypeLabel: Record<string, string> = {
  HOMEWORK: 'Uy vazifasi',
  PARTICIPATION: 'Faollik',
  QUIZ: 'Test',
  ASSESSMENT: 'Baholash',
  ATTENDANCE: 'Davomat',
  OTHER: 'Boshqa',
}

const UZ_MONTHS_SHORT = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
]

export function formatMonthYear(month: number, year: number): string {
  return `${UZ_MONTHS_SHORT[month - 1]} ${year}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function cycleAnchorDate(anchorDay: number, year: number, month: number): Date {
  return new Date(year, month, Math.min(anchorDay, daysInMonth(year, month)))
}

/**
 * The recurring monthly due date implied by an anchor date (the group's lesson start date,
 * not any individual student's enrollment date -- every student in a group shares the same
 * payment day) -- e.g. a 5 September start makes the 5th of every month the payment day.
 * Clamped to the last day of shorter months (a 31st start is due the 28th/30th in months
 * without one), and never lands before the anchor's own first cycle.
 */
export function nextPaymentDueDate(anchorDate: string | Date, from: Date = new Date()): Date {
  const anchor = typeof anchorDate === 'string' ? new Date(anchorDate) : anchorDate
  const anchorDay = anchor.getDate()
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())

  let candidate = cycleAnchorDate(anchorDay, today.getFullYear(), today.getMonth())
  if (candidate < today) candidate = cycleAnchorDate(anchorDay, today.getFullYear(), today.getMonth() + 1)

  const firstDue = cycleAnchorDate(anchorDay, anchor.getFullYear(), anchor.getMonth())
  return candidate < firstDue ? firstDue : candidate
}

/** The [start, end) of the monthly billing cycle -- anchored to `anchorDate`'s day-of-month,
 * e.g. the group's lesson start date -- that contains `target`. */
function billingCycleContaining(anchorDate: Date, target: Date): { start: Date; end: Date } {
  const anchorDay = anchorDate.getDate()
  let start = cycleAnchorDate(anchorDay, target.getFullYear(), target.getMonth())
  if (start > target) start = cycleAnchorDate(anchorDay, target.getFullYear(), target.getMonth() - 1)
  const end = cycleAnchorDate(anchorDay, start.getFullYear(), start.getMonth() + 1)
  return { start, end }
}

export type FirstCycleProration = {
  /** The (year, month) of the Payment row this proration applies to -- the billing cycle the
   * student's enrollment starts within, keyed by that cycle's start date. */
  year: number
  month: number
  enrolledDays: number
  cycleDays: number
  ratio: number
}

/**
 * When a student joins a group mid-cycle, they're billed on the same shared monthly schedule
 * as everyone else (see `nextPaymentDueDate`), but only for the days they were actually
 * enrolled during that first cycle -- e.g. a group starting 5 September with a student joining
 * 15 September owes for 20 of that cycle's 30 days, not the full month. Returns null when the
 * student joined exactly on a cycle boundary, so their first cycle is already full.
 */
export function firstCycleProration(groupStart: string | Date, enrollmentStart: string | Date): FirstCycleProration | null {
  const anchor = typeof groupStart === 'string' ? new Date(groupStart) : groupStart
  const joinedRaw = typeof enrollmentStart === 'string' ? new Date(enrollmentStart) : enrollmentStart
  const joined = new Date(joinedRaw.getFullYear(), joinedRaw.getMonth(), joinedRaw.getDate())

  const { start, end } = billingCycleContaining(anchor, joined)
  if (joined.getTime() === start.getTime()) return null

  const cycleDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  const missedDays = Math.round((joined.getTime() - start.getTime()) / 86_400_000)
  const enrolledDays = cycleDays - missedDays
  return { year: start.getFullYear(), month: start.getMonth() + 1, enrolledDays, cycleDays, ratio: enrolledDays / cycleDays }
}

export function daysUntil(date: Date, from: Date = new Date()): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function paymentCountdownLabel(days: number): string {
  if (days === 0) return 'Bugun'
  if (days === 1) return 'Ertaga'
  if (days > 0) return `${days} kun qoldi`
  return `${Math.abs(days)} kun kechikdi`
}

export function paymentCountdownTone(days: number): 'green' | 'amber' | 'red' {
  if (days < 0) return 'red'
  if (days <= 3) return 'amber'
  return 'green'
}

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString('ru-RU')} soʻm`
}

export function initials(fullName?: string | null): string {
  if (!fullName) return '?'
  const parts = fullName.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export type Accent = { bar: string; badge: string; dayActive: string; avatar: string }

const ACCENTS: Accent[] = [
  {
    bar: 'bg-indigo-500',
    badge:
      'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20',
    dayActive: 'bg-indigo-600 text-white',
    avatar: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  },
  {
    bar: 'bg-emerald-500',
    badge:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    dayActive: 'bg-emerald-600 text-white',
    avatar: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  {
    bar: 'bg-amber-500',
    badge:
      'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
    dayActive: 'bg-amber-600 text-white',
    avatar: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  {
    bar: 'bg-rose-500',
    badge:
      'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
    dayActive: 'bg-rose-600 text-white',
    avatar: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  },
  {
    bar: 'bg-sky-500',
    badge:
      'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
    dayActive: 'bg-sky-600 text-white',
    avatar: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  },
  {
    bar: 'bg-violet-500',
    badge:
      'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20',
    dayActive: 'bg-violet-600 text-white',
    avatar: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  },
  {
    bar: 'bg-teal-500',
    badge:
      'bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20',
    dayActive: 'bg-teal-600 text-white',
    avatar: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  },
  {
    bar: 'bg-fuchsia-500',
    badge:
      'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/20',
    dayActive: 'bg-fuchsia-600 text-white',
    avatar: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  },
]

/**
 * Assigns each distinct key its own color, in order of first appearance,
 * cycling through the palette only once every key has one. Keeps colors
 * stable across renders (same input order -> same assignment) without ever
 * putting two different levels on the same color until the palette runs out.
 */
export function buildAccentMap(keysInOrder: string[]): Map<string, Accent> {
  const map = new Map<string, Accent>()
  for (const key of keysInOrder) {
    if (!map.has(key)) map.set(key, ACCENTS[map.size % ACCENTS.length])
  }
  return map
}
