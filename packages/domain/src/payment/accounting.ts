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
 * Accounting: what each month should have brought in, what it did, and who still owes.
 *
 * A student pays for each month on their own payment day (see billing.ts). For a month, a student
 * is *billed* when they had joined by then and were in a group during that cycle -- or simply when
 * a payment is recorded for it. What they owe is the recorded amount, else their group's fee;
 * what came in is what's recorded as paid. Money is counted by the month it pays for, not the day
 * it was handed over: "October" is everything paid for October's cycles.
 */

export type AccountingStudent = { id: string; firstName: string; lastName: string; joinedAt: Date; status: StudentStatus }
export type AccountingEnrollment = { studentId: string; groupId: string; startDate: Date; endDate: Date | null }
export type AccountingGroup = { id: string; name: string; monthlyFee: number }
export type AccountingPayment = {
  id: string
  studentId: string
  year: number
  month: number
  amountDue: number
  amountPaid: number
  note: string | null
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
  /** The part of `missing` whose payment day has already passed. */
  overdue: number
  students: number
  paid: number
  partial: number
  unpaid: number
  upcoming: number
  noFee: number
}

const monthIndex = (m: BillingMonth) => m.year * 12 + m.month
const fullName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`.trim()

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
    overdue: 0,
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
    if (daysBetween(calendarDayOf(line.dueDate), today) >= 0) summary.overdue += left
    summary[line.state] += 1
  }
  return summary
}

export type GroupAccounting = AccountingSummary & { groupId: string | null; groupName: string | null }

export type Accounting = {
  month: BillingMonth
  summary: AccountingSummary
  groups: GroupAccounting[]
  lines: AccountingLine[]
  /** The six months up to the chosen one, oldest first. */
  trend: Array<BillingMonth & { expected: number; collected: number }>
  /** Next month (after today's), as it looks now -- what the center should expect to bring in. */
  forecast: BillingMonth & AccountingSummary
  /** Owed for every month whose payment day has passed, all months together. */
  totalDebt: number
  /** Students who owe for at least one month whose payment day has passed. */
  debtors: Array<{ studentId: string; studentName: string; groupName: string | null; months: number; amount: number }>
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

  const byGroup = new Map<string | null, AccountingLine[]>()
  for (const line of lines) byGroup.set(line.groupId, [...(byGroup.get(line.groupId) ?? []), line])
  const groups = [...byGroup].map(([groupId, own]) => ({
    groupId,
    groupName: own[0].groupName,
    ...summarize(own, today),
  }))
  groups.sort((a, b) => b.expected - a.expected)

  const trend = Array.from({ length: 6 }, (_, i) => {
    const m = addMonths(month, i - 5)
    const s = summarize(monthLines(data, m, today, groupIds), today)
    return { ...m, expected: s.expected, collected: s.collected }
  })

  const current: BillingMonth = { year: today.year, month: today.month }
  const next = addMonths(current, 1)
  const forecast = { ...next, ...summarize(monthLines(data, next, today, groupIds), today) }

  // Every month from the earliest join to today's -- the debt is whatever came due and wasn't paid.
  const debtByStudent = new Map<string, { studentName: string; groupName: string | null; months: number; amount: number }>()
  const earliest = data.students.reduce<BillingMonth>((min, s) => {
    const j = calendarDayOf(s.joinedAt)
    return monthIndex(j) < monthIndex(min) ? { year: j.year, month: j.month } : min
  }, current)
  for (let m = earliest; monthIndex(m) <= monthIndex(current); m = addMonths(m, 1)) {
    for (const line of monthLines(data, m, today, groupIds)) {
      const left = Math.max(line.amountDue - line.amountPaid, 0)
      if (left === 0 || daysBetween(calendarDayOf(line.dueDate), today) < 0) continue
      const entry = debtByStudent.get(line.studentId) ?? { studentName: line.studentName, groupName: line.groupName, months: 0, amount: 0 }
      entry.months += 1
      entry.amount += left
      // The group shown is the one they owe for most recently.
      entry.groupName = line.groupName
      debtByStudent.set(line.studentId, entry)
    }
  }
  const debtors = [...debtByStudent]
    .map(([studentId, d]) => ({ studentId, ...d }))
    .sort((a, b) => b.amount - a.amount)

  return {
    month,
    summary: summarize(lines, today),
    groups,
    lines,
    trend,
    forecast,
    totalDebt: debtors.reduce((sum, d) => sum + d.amount, 0),
    debtors,
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
      where: { studentId: { in: studentIds } },
      select: { id: true, studentId: true, year: true, month: true, amountDue: true, amountPaid: true, note: true },
    }),
  ])
  const groups = await prisma.group.findMany({
    where: { id: { in: [...new Set(enrollments.map((e) => e.groupId))] } },
    select: { id: true, name: true, monthlyFee: true },
  })

  return buildAccounting({ students, enrollments, groups, payments }, month, today, groupIds ? new Set(groupIds) : null)
}
