import { prisma, type PaymentStatus } from '@tashkurgan/db'
import { NotFoundError, ValidationError } from '@tashkurgan/shared'

/** Status is always re-derived from the amounts (never set independently), so it can't drift out of sync (§51.4). */
export function derivePaymentStatus(amountDue: number, amountPaid: number): PaymentStatus {
  if (amountPaid >= amountDue) return 'PAID'
  if (amountPaid > 0) return 'PARTIAL'
  return 'DEBT'
}

/** Each month is tracked independently -- no carry-forward -- but the admin always sees the true cross-month total owed (§51.4). */
export function computeOutstanding(payments: Array<{ amountDue: number; amountPaid: number }>): number {
  return payments.reduce((sum, p) => sum + Math.max(p.amountDue - p.amountPaid, 0), 0)
}

export type RecordPaymentInput = {
  studentId: string
  year: number
  month: number
  amountDue: number
  amountPaid?: number
  note?: string
  recordedByUserId: string
}

/**
 * Upserts the one Payment row for (Student, calendar month). Both Admin and
 * Teacher may call this (§51.4) -- there's no forward-only lock, so a later
 * call for the same month simply overwrites the previous amounts (§51.5: no
 * audit trail in V1).
 */
export async function recordPayment(input: RecordPaymentInput) {
  if (input.month < 1 || input.month > 12) throw new ValidationError('month must be between 1 and 12')
  const amountPaid = input.amountPaid ?? 0
  const status = derivePaymentStatus(input.amountDue, amountPaid)
  const paidAt = status === 'PAID' ? new Date() : null

  return prisma.payment.upsert({
    where: { studentId_year_month: { studentId: input.studentId, year: input.year, month: input.month } },
    update: {
      amountDue: input.amountDue,
      amountPaid,
      status,
      paidAt,
      note: input.note,
      recordedByUserId: input.recordedByUserId,
    },
    create: {
      studentId: input.studentId,
      year: input.year,
      month: input.month,
      amountDue: input.amountDue,
      amountPaid,
      status,
      paidAt,
      note: input.note,
      recordedByUserId: input.recordedByUserId,
    },
  })
}

export type UpdatePaymentInput = {
  amountDue?: number
  amountPaid?: number
  note?: string
  recordedByUserId: string
}

/** Corrects an existing month's payment row in place -- edits overwrite directly (§51.5). */
export async function updatePayment(paymentId: string, input: UpdatePaymentInput) {
  const existing = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!existing) throw new NotFoundError('Payment not found')

  const amountDue = input.amountDue ?? existing.amountDue
  const amountPaid = input.amountPaid ?? existing.amountPaid
  const status = derivePaymentStatus(amountDue, amountPaid)

  return prisma.payment.update({
    where: { id: paymentId },
    data: {
      amountDue,
      amountPaid,
      status,
      paidAt: status === 'PAID' ? (existing.paidAt ?? new Date()) : null,
      note: input.note ?? existing.note,
      recordedByUserId: input.recordedByUserId,
    },
  })
}

/**
 * One calendar month's Payment row (or none, meaning nothing has been
 * recorded yet) for every actively enrolled student in a Group -- the
 * accounting view of the group roster.
 */
export async function getGroupPaymentStatus(groupId: string, year: number, month: number) {
  const enrollments = await prisma.enrollment.findMany({
    where: { groupId, status: 'ACTIVE' },
    include: { student: true },
  })
  const studentIds = enrollments.map((e) => e.studentId)

  const payments = await prisma.payment.findMany({
    where: { studentId: { in: studentIds }, year, month },
  })
  const paymentByStudent = new Map(payments.map((p) => [p.studentId, p]))

  return enrollments.map((e) => ({ student: e.student, payment: paymentByStudent.get(e.studentId) ?? null }))
}

/**
 * Every Payment row ever recorded for a Group's active roster -- the
 * accounting matrix (students × months) is built client-side from this,
 * one query instead of one per month.
 */
export async function getGroupPaymentHistory(groupId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { groupId, status: 'ACTIVE' },
    include: { student: true },
  })
  const studentIds = enrollments.map((e) => e.studentId)

  const payments = await prisma.payment.findMany({
    where: { studentId: { in: studentIds } },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  })

  return { students: enrollments.map((e) => e.student), payments }
}
