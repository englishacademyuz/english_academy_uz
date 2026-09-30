// Pure billing-calendar math, shared by the server, the bot and both web apps -- so no dependencies here.
//
// Every student is billed on their own monthly schedule, anchored to the day they joined
// (Student.joinedAt): someone who joined on 15 September owes on the 15th of every month,
// starting the day they joined. A cycle's Payment row is keyed by the (year, month) its
// payment day falls in.
//
// All dates are calendar days in the center's time zone. Stored dates (joinedAt, a lesson's
// startDate) are midnight UTC of the picked day, so their UTC fields *are* that calendar day;
// "today" is always taken in Tashkent, whatever time zone the server or browser runs in.

export type CalendarDay = { year: number; month: number; day: number }
export type BillingMonth = { year: number; month: number }

/** Uzbekistan has no daylight saving -- a fixed UTC+5. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000
const DAY_MS = 86_400_000

/** How many days before the payment day the reminder button appears. */
export const REMINDER_LEAD_DAYS = 3
/** How many days past the payment day a student is only late -- after that, a debtor. */
export const GRACE_DAYS = 5

/** The calendar day a stored date (midnight UTC of that day) stands for. */
export function calendarDayOf(date: string | Date): CalendarDay {
  const d = typeof date === 'string' ? new Date(date) : date
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** Today's date in the center (Tashkent). */
export function tashkentToday(now: Date = new Date()): CalendarDay {
  return calendarDayOf(new Date(now.getTime() + TASHKENT_OFFSET_MS))
}

/** A calendar day as a stored date -- midnight UTC of it. */
export function toStoredDate({ year, month, day }: CalendarDay): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

/** `YYYY-MM-DD`, as a date input wants it. */
export function toIsoDay({ year, month, day }: CalendarDay): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const serial = (d: CalendarDay) => Date.UTC(d.year, d.month - 1, d.day) / DAY_MS

/** Whole days from `from` to `to` -- negative when `to` is earlier. */
export function daysBetween(from: CalendarDay, to: CalendarDay): number {
  return serial(to) - serial(from)
}

export function addMonths({ year, month }: BillingMonth, by: number): BillingMonth {
  const index = year * 12 + (month - 1) + by
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

const compareMonths = (a: BillingMonth, b: BillingMonth) => a.year * 12 + a.month - (b.year * 12 + b.month)

/** The day a (year, month) cycle falls due: the join day in that month, clamped in shorter months (a 31st joiner pays on the 30th/28th). */
export function paymentDay(joinedAt: string | Date, { year, month }: BillingMonth): CalendarDay {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { year, month, day: Math.min(calendarDayOf(joinedAt).day, lastDay) }
}

/**
 * The cycle `on` falls in: the one whose payment day most recently passed. Someone paying on the
 * 15th is still in September's cycle on 3 October. Before the student joins, it's their first cycle.
 */
export function billingMonthOf(joinedAt: string | Date, on: CalendarDay): BillingMonth {
  const joined = calendarDayOf(joinedAt)
  if (daysBetween(joined, on) <= 0) return { year: joined.year, month: joined.month }
  const same = { year: on.year, month: on.month }
  return daysBetween(paymentDay(joinedAt, same), on) >= 0 ? same : addMonths(same, -1)
}

export type ReminderStage =
  /** The payment day is 1–3 days away. */
  | 'upcoming'
  /** Today is the payment day. */
  | 'due'
  /** 1–5 days past the payment day. */
  | 'overdue'
  /** More than 5 days past the payment day. */
  | 'debtor'

export type PaymentReminder = {
  stage: ReminderStage
  /** The cycle that is owed -- the oldest unpaid one. */
  year: number
  month: number
  dueDate: string
  /** Days until the payment day -- negative once it has passed. */
  daysLeft: number
  /** Unpaid cycles whose payment day has already come -- 0 while the reminder is only upcoming. */
  unpaidCycles: number
}

export function reminderStage(daysLeft: number): ReminderStage {
  if (daysLeft > 0) return 'upcoming'
  if (daysLeft === 0) return 'due'
  return -daysLeft <= GRACE_DAYS ? 'overdue' : 'debtor'
}

/**
 * What the student owes right now, or null when nothing is due within the next three days.
 * Walks the cycles from the student's first one up to the one due in three days' time and
 * picks the oldest that isn't fully paid -- a partly paid month is still owed.
 */
export function paymentReminder(
  joinedAt: string | Date,
  paidMonths: BillingMonth[],
  today: CalendarDay,
): PaymentReminder | null {
  const joined = calendarDayOf(joinedAt)
  const horizon = toStoredDate(today)
  horizon.setUTCDate(horizon.getUTCDate() + REMINDER_LEAD_DAYS)
  const last = billingMonthOf(joinedAt, calendarDayOf(horizon))
  const paid = new Set(paidMonths.map((m) => `${m.year}-${m.month}`))

  let oldest: BillingMonth | null = null
  let unpaidCycles = 0
  for (let m: BillingMonth = { year: joined.year, month: joined.month }; compareMonths(m, last) <= 0; m = addMonths(m, 1)) {
    if (paid.has(`${m.year}-${m.month}`)) continue
    oldest ??= m
    if (daysBetween(paymentDay(joinedAt, m), today) >= 0) unpaidCycles += 1
  }
  if (!oldest) return null

  const due = paymentDay(joinedAt, oldest)
  const daysLeft = daysBetween(today, due)
  // A student who joins later than three days from now owes nothing yet.
  if (daysLeft > REMINDER_LEAD_DAYS) return null
  return {
    stage: reminderStage(daysLeft),
    ...oldest,
    dueDate: toStoredDate(due).toISOString(),
    daysLeft,
    unpaidCycles,
  }
}
