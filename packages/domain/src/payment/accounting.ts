import { prisma, type StudentStatus } from '@tashkurgan/db'
import {
  addMonths,
  calendarDayOf,
  cycleStart,
  daysBetween,
  tashkentToday,
  toStoredDate,
  type BillingMonth,
  type CalendarDay,
} from '@tashkurgan/shared'

/**
 * Accounting: what a month should have brought in, what it did, why it's short, and who owes.
 *
 * A student pays for each month on their own payment day (see billing.ts). For a month, a student
 * is *billed* when they had joined by then and were in a group during that cycle -- or simply when
 * a payment is recorded for it. What they owe is the recorded amount, else their group's fee;
 * what came in is what's recorded as paid. Money is counted by the month it pays for, not the day
 * it was handed over: "October" is everything paid for October's cycles.
 */

export type AccountingStudent = { id: string; firstName: string; lastName: string; joinedAt: Date; status: StudentStatus }
export type AccountingEnrollment = { studentId: string; groupId: string; startDate: Date; endDate: Date | null }
export type AccountingGroup = { id: string; name: string; monthlyFee: number; teacherName: string | null }
export type AccountingPayment = {
  id: string
  studentId: string
  year: number
  month: number
  amountDue: number
  amountPaid: number
  note: string | null
  /** When it was paid in full -- null while it isn't. */
  paidAt: Date | null
  createdAt: Date
}

export type AccountingData = {
  students: AccountingStudent[]
  enrollments: AccountingEnrollment[]
  groups: AccountingGroup[]
  payments: AccountingPayment[]
}

export type LineState =
  /** Paid in full. */
  | 'paid'
  /** Some of it paid. */
  | 'partial'
  /** Nothing paid and the payment day has come. */
  | 'unpaid'
  /** Nothing paid, but the payment day is still ahead. */
  | 'upcoming'
  /** Nothing recorded and the group has no fee set -- nothing to expect yet. */
  | 'noFee'

/** One student's bill for one month. */
export type AccountingLine = {
  studentId: string
  studentName: string
  groupId: string | null
  groupName: string | null
  teacherName: string | null
  /** The payment day, as a stored date (midnight UTC of the day). */
  dueDate: Date
  amountDue: number
  amountPaid: number
  state: LineState
  paymentId: string | null
  note: string | null
}

export type AccountingSummary = {
  /** What the month should bring in. */
  expected: number
  /** What has been paid for it. */
  collected: number
  /** Still to come in -- expected minus collected, per student (an overpayment doesn't cover someone else). */
  missing: number
  /** Why `missing` is what it is -- these three add up to it. */
  unpaidAmount: number
  partialAmount: number
  upcomingAmount: number
  /** The part of `missing` whose payment day has already passed -- what to collect now. */
  overdue: number
  overdueStudents: number
  students: number
  paid: number
  partial: number
  unpaid: number
  upcoming: number
  noFee: number
}

/** Last month, to compare with: how much of it was in by this same day, and by its end. */
export type PreviousMonth = BillingMonth & {
  /** Share collected by the same day of that month -- null unless the month shown is the current one. */
  sameDayPercent: number | null
  /** Share collected for it all told, as of today. */
  finalPercent: number
}

const monthIndex = (m: BillingMonth) => m.year * 12 + m.month
const fullName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`.trim()
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
/** Uzbekistan has no daylight saving -- a fixed UTC+5. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000

/**
 * Every billed student's line for `month`. `groupIds` limits it to those groups (a teacher's own);
 * null means all, including bills that can't be tied to any group.
 */
export function monthLines(
  data: AccountingData,
  month: BillingMonth,
  today: CalendarDay,
  groupIds: Set<string> | null = null,
): AccountingLine[] {
  const groupById = new Map(data.groups.map((g) => [g.id, g]))
  const lines: AccountingLine[] = []

  for (const student of data.students) {
    const joined = calendarDayOf(student.joinedAt)
    const row = data.payments.find((p) => p.studentId === student.id && p.year === month.year && p.month === month.month)
    if (!row && monthIndex(month) < monthIndex(joined)) continue

    const start = cycleStart(student.joinedAt, month)
    const startAt = toStoredDate(start)
    const nextStartAt = toStoredDate(cycleStart(student.joinedAt, addMonths(month, 1)))
    const own = data.enrollments
      .filter((e) => e.studentId === student.id && e.startDate < nextStartAt)
      .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    // The group they were in during the cycle -- the latest one when they moved mid-cycle, as on the payment form.
    const during = own.find((e) => !e.endDate || e.endDate >= startAt)

    if (!row) {
      if (!during) continue
      // A paused or departed student isn't expected to pay for a month that's still running or ahead.
      const cycleOver = daysBetween(calendarDayOf(nextStartAt), today) >= 0
      if (student.status !== 'ACTIVE' && !cycleOver) continue
    }

    // A recorded payment without a group that cycle still belongs to the group they were in last.
    const enrollment = during ?? own[0]
    const group = enrollment ? groupById.get(enrollment.groupId) ?? null : null
    if (groupIds && (!group || !groupIds.has(group.id))) continue

    const amountDue = row?.amountDue ?? group?.monthlyFee ?? 0
    const amountPaid = row?.amountPaid ?? 0
    const dueReached = daysBetween(start, today) >= 0
    const state: LineState =
      !row && amountDue === 0
        ? 'noFee'
        : amountPaid >= amountDue
          ? 'paid'
          : amountPaid > 0
            ? 'partial'
            : dueReached
              ? 'unpaid'
              : 'upcoming'

    lines.push({
      studentId: student.id,
      studentName: fullName(student),
      groupId: group?.id ?? null,
      groupName: group?.name ?? null,
      teacherName: group?.teacherName ?? null,
      dueDate: startAt,
      amountDue,
      amountPaid,
      state,
      paymentId: row?.id ?? null,
      note: row?.note ?? null,
    })
  }
  return lines
}

export function summarize(lines: AccountingLine[], today: CalendarDay): AccountingSummary {
  const summary: AccountingSummary = {
    expected: 0,
    collected: 0,
    missing: 0,
    unpaidAmount: 0,
    partialAmount: 0,
    upcomingAmount: 0,
    overdue: 0,
    overdueStudents: 0,
    students: lines.length,
    paid: 0,
    partial: 0,
    unpaid: 0,
    upcoming: 0,
    noFee: 0,
  }
  for (const line of lines) {
    const left = Math.max(line.amountDue - line.amountPaid, 0)
    summary.expected += line.amountDue
    summary.collected += line.amountPaid
    summary.missing += left
    if (line.state === 'unpaid') summary.unpaidAmount += left
    if (line.state === 'partial') summary.partialAmount += left
    if (line.state === 'upcoming') summary.upcomingAmount += left
    if (left > 0 && daysBetween(calendarDayOf(line.dueDate), today) >= 0) {
      summary.overdue += left
      summary.overdueStudents += 1
    }
    summary[line.state] += 1
  }
  return summary
}

/**
 * The share of a month's expected money that was in by the end of `cutoff` (a Tashkent day). A
 * payment counts from when it was paid in full, else from when it was first recorded -- a partial
 * payment completed later counts in full only from then.
 */
function collectedPercentBy(lines: AccountingLine[], payments: AccountingPayment[], cutoff: CalendarDay) {
  const end = Date.UTC(cutoff.year, cutoff.month - 1, cutoff.day + 1) - TASHKENT_OFFSET_MS
  const byId = new Map(payments.map((p) => [p.id, p]))
  let collected = 0
  let expected = 0
  for (const line of lines) {
    expected += line.amountDue
    const row = line.paymentId ? byId.get(line.paymentId) : undefined
    if (row && (row.paidAt ?? row.createdAt).getTime() < end) collected += line.amountPaid
  }
  return percent(collected, expected)
}

export type GroupAccounting = AccountingSummary & {
  groupId: string | null
  groupName: string | null
  teacherName: string | null
  previous: PreviousMonth
}

export type Accounting = {
  month: BillingMonth
  /** The day the figures are as of (Tashkent). */
  today: CalendarDay
  summary: AccountingSummary
  previous: PreviousMonth
  /** Biggest shortfall first. */
  groups: GroupAccounting[]
  lines: AccountingLine[]
}

/** The whole accounting view, from data already loaded -- pure, so it's tested without a database. */
export function buildAccounting(
  data: AccountingData,
  month: BillingMonth,
  today: CalendarDay,
  groupIds: Set<string> | null = null,
): Accounting {
  const lines = monthLines(data, month, today, groupIds).sort(
    (a, b) => (a.groupName ?? '').localeCompare(b.groupName ?? '') || a.studentName.localeCompare(b.studentName),
  )

  const prevMonth = addMonths(month, -1)
  const prevLines = monthLines(data, prevMonth, today, groupIds)
  const isCurrent = month.year === today.year && month.month === today.month
  const lastDayOfPrev = new Date(Date.UTC(prevMonth.year, prevMonth.month, 0)).getUTCDate()
  const sameDay = { ...prevMonth, day: Math.min(today.day, lastDayOfPrev) }
  const previousOf = (own: AccountingLine[]): PreviousMonth => {
    const s = summarize(own, today)
    return {
      ...prevMonth,
      sameDayPercent: isCurrent ? collectedPercentBy(own, data.payments, sameDay) : null,
      finalPercent: percent(s.collected, s.expected),
    }
  }

  const byGroup = new Map<string | null, AccountingLine[]>()
  for (const line of lines) byGroup.set(line.groupId, [...(byGroup.get(line.groupId) ?? []), line])
  const groups = [...byGroup].map(([groupId, own]) => ({
    groupId,
    groupName: own[0].groupName,
    teacherName: own[0].teacherName,
    ...summarize(own, today),
    previous: previousOf(prevLines.filter((l) => l.groupId === groupId)),
  }))
  groups.sort((a, b) => b.missing - a.missing || (a.groupName ?? '').localeCompare(b.groupName ?? ''))

  return {
    month,
    today,
    summary: summarize(lines, today),
    previous: previousOf(prevLines),
    groups,
    lines,
  }
}

/**
 * Loads what `buildAccounting` needs. `groupIds` null = the whole center; otherwise only students
 * who have ever been in one of those groups are read (with all their enrollments, so a bill is
 * still tied to the right group when they moved).
 */
export async function getAccounting(
  month: BillingMonth,
  { groupIds = null, today = tashkentToday() }: { groupIds?: string[] | null; today?: CalendarDay } = {},
): Promise<Accounting> {
  const studentFilter = groupIds ? { enrollments: { some: { groupId: { in: groupIds } } } } : {}
  const students = await prisma.student.findMany({
    where: studentFilter,
    select: { id: true, firstName: true, lastName: true, joinedAt: true, status: true },
  })
  const studentIds = students.map((s) => s.id)
  const [enrollments, payments] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, groupId: true, startDate: true, endDate: true },
    }),
    prisma.payment.findMany({
      // Only the two months the page reads.
      where: {
        studentId: { in: studentIds },
        OR: [month, addMonths(month, -1)].map((m) => ({ year: m.year, month: m.month })),
      },
      select: {
        id: true,
        studentId: true,
        year: true,
        month: true,
        amountDue: true,
        amountPaid: true,
        note: true,
        paidAt: true,
        createdAt: true,
      },
    }),
  ])
  const groups = await prisma.group.findMany({
    where: { id: { in: [...new Set(enrollments.map((e) => e.groupId))] } },
    select: { id: true, name: true, monthlyFee: true, teacher: { select: { fullName: true } } },
  })

  return buildAccounting(
    {
      students,
      enrollments,
      groups: groups.map((g) => ({ id: g.id, name: g.name, monthlyFee: g.monthlyFee, teacherName: g.teacher?.fullName ?? null })),
      payments,
    },
    month,
    today,
    groupIds ? new Set(groupIds) : null,
  )
}
