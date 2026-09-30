import { prisma } from '@tashkurgan/db'
import { NotFoundError } from '@tashkurgan/shared'

/**
 * Removes a student and everything recorded about them -- enrollments, attendance, marks, quiz
 * attempts, payments and points -- in one transaction. It can't be undone; a student who simply
 * stopped coming should get the LEFT status instead, which keeps their history.
 */
export async function deleteStudent(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } })
  if (!student) throw new NotFoundError('Student not found')

  const where = { studentId }
  await prisma.$transaction([
    // Quiz answers go with their attempts (onDelete: Cascade); Telegram links, linking codes and the family chat go with the student.
    prisma.quizAttempt.deleteMany({ where }),
    prisma.pointTransaction.deleteMany({ where }),
    prisma.payment.deleteMany({ where }),
    prisma.assessmentResult.deleteMany({ where }),
    prisma.homeworkResult.deleteMany({ where }),
    prisma.attendance.deleteMany({ where }),
    prisma.enrollment.deleteMany({ where }),
    prisma.student.delete({ where: { id: studentId } }),
    ...(student.userId ? [prisma.user.delete({ where: { id: student.userId } })] : []),
  ])
}
