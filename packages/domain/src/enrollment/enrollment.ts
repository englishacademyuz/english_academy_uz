import { prisma, type Prisma, type EnrollmentEndReason } from '@tashkurgan/db'
import { ConflictError, NotFoundError } from '@tashkurgan/shared'

type Db = typeof prisma | Prisma.TransactionClient

async function assertNoActiveEnrollment(db: Db, studentId: string, subjectId: string) {
  const existing = await db.enrollment.findFirst({ where: { studentId, subjectId, status: 'ACTIVE' } })
  if (existing) {
    throw new ConflictError('Student already has an active enrollment in this subject')
  }
}

async function createEnrollment(db: Db, studentId: string, groupId: string, startDate: Date) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: { level: { include: { course: true } } },
  })
  if (!group) throw new NotFoundError('Group not found')

  const subjectId = group.level.course.subjectId
  await assertNoActiveEnrollment(db, studentId, subjectId)

  return db.enrollment.create({
    data: { studentId, groupId, subjectId, startDate, status: 'ACTIVE' },
  })
}

/** Enrolls a student in a group. Fails if they already hold an active enrollment in that subject. */
export async function enrollStudent(studentId: string, groupId: string, startDate: Date) {
  return prisma.$transaction((tx) => createEnrollment(tx, studentId, groupId, startDate))
}

/** Closes an enrollment. Never deleted -- the row remains as history (requirements §9/§41). */
export async function endEnrollment(
  enrollmentId: string,
  endDate: Date,
  endReason: EnrollmentEndReason,
  db: Db = prisma,
) {
  const enrollment = await db.enrollment.findUnique({ where: { id: enrollmentId } })
  if (!enrollment) throw new NotFoundError('Enrollment not found')
  if (enrollment.status === 'ENDED') throw new ConflictError('Enrollment already ended')

  return db.enrollment.update({
    where: { id: enrollmentId },
    data: { status: 'ENDED', endDate, endReason },
  })
}

/**
 * Moves a student to a new group: closes the current enrollment with
 * reason GROUP_CHANGE and opens a new one, atomically. Never edits an
 * enrollment's group in place (§51.2 -- reports must split per-enrollment).
 */
export async function changeGroup(enrollmentId: string, toGroupId: string, changeDate: Date) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.enrollment.findUnique({ where: { id: enrollmentId } })
    if (!current) throw new NotFoundError('Enrollment not found')
    if (current.status !== 'ACTIVE') throw new ConflictError('Enrollment is not active')

    await endEnrollment(enrollmentId, changeDate, 'GROUP_CHANGE', tx)
    return createEnrollment(tx, current.studentId, toGroupId, changeDate)
  })
}
