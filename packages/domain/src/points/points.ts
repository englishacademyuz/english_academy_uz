import { prisma, type PointActivityType, type Prisma } from '@tashkurgan/db'
import { NotFoundError } from '@tashkurgan/shared'

/** Sums a set of ledger entries -- the only supported way to get a total; there is no separately maintained running total (§39/§51.3). */
export function sumPoints(transactions: Array<{ points: number }>): number {
  return transactions.reduce((sum, t) => sum + t.points, 0)
}

export type AwardPointsInput = {
  studentId: string
  groupId: string
  activityType: PointActivityType
  points: number
  note?: string
}

/**
 * Appends one immutable ledger entry, tagged with the Group active when it
 * was earned (§51.3). Never updates or deletes an existing entry -- a
 * correction is made by appending a new (possibly negative) entry instead.
 */
export async function awardPoints(input: AwardPointsInput) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: input.studentId, groupId: input.groupId },
  })
  if (!enrollment) throw new NotFoundError('Student is not enrolled in this group')

  return prisma.pointTransaction.create({
    data: {
      studentId: input.studentId,
      groupId: input.groupId,
      activityType: input.activityType,
      points: input.points,
      note: input.note,
    },
  })
}

export type SyncAssessmentPointsInput = {
  assessmentResultId: string
  studentId: string
  groupId: string
  points: number
}

/**
 * Upserts the one PointTransaction derived from an AssessmentResult, keyed on that result so
 * re-grading recomputes it instead of appending a duplicate entry -- unlike a manual award (which
 * stays append-only, corrected by appending a new entry, §51.3), this row always mirrors the
 * result's current score because that source itself is directly editable.
 */
export async function syncAssessmentPoints(
  tx: Prisma.TransactionClient,
  input: SyncAssessmentPointsInput,
) {
  return tx.pointTransaction.upsert({
    where: { assessmentResultId: input.assessmentResultId },
    update: { points: input.points },
    create: {
      studentId: input.studentId,
      groupId: input.groupId,
      activityType: 'ASSESSMENT',
      points: input.points,
      assessmentResultId: input.assessmentResultId,
    },
  })
}

/**
 * Per-student point totals for one Group's currently active roster, summed
 * only from transactions tagged to that Group (§51.3) -- a student's prior
 * group's points never carry into this ranking. Every active student
 * appears, even at 0, so the table doesn't silently drop anyone. Sorted
 * highest-first so the top scorer is row zero.
 */
export async function getGroupLeaderboard(groupId: string, range?: { start: Date; end: Date }) {
  const enrollments = await prisma.enrollment.findMany({
    where: { groupId, status: 'ACTIVE' },
    include: { student: true },
  })

  const transactions = await prisma.pointTransaction.findMany({
    where: { groupId, ...(range ? { createdAt: { gte: range.start, lte: range.end } } : {}) },
    select: { studentId: true, points: true },
  })
  const totalByStudent = new Map<string, number>()
  for (const t of transactions) totalByStudent.set(t.studentId, (totalByStudent.get(t.studentId) ?? 0) + t.points)

  return enrollments
    .map((e) => ({ student: e.student, points: totalByStudent.get(e.studentId) ?? 0 }))
    .sort((a, b) => b.points - a.points)
}
