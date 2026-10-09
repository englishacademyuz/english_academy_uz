import { prisma } from '@tashkurgan/db'
import { NotFoundError } from '@tashkurgan/shared'
import { studentChatIds } from '../identity/family'
import { calculateAttendanceRate } from '../attendance/attendance'
import { computeOutstanding, getPaymentReminder } from '../payment/payment'
import { sumPoints } from '../points/points'


/**
 * One deep read model for the student detail screen -- composes everything
 * the requirements list as "historical information" for a student (§28:
 * attendance, marks, assessments, payments, group history, points) into a
 * single call, the same way getProgress composes a timeframe snapshot.
 * Nothing here is persisted; it's all queried fresh (§39).
 */
export async function getStudentOverview(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } })
  if (!student) throw new NotFoundError('Student not found')

  const [enrollments, telegramLinkCount, attendances, assessmentResults, quizAttempts, payments, pointTransactions, reminder] =
    await Promise.all([
      prisma.enrollment.findMany({
        where: { studentId },
        include: {
          group: { include: { level: { include: { course: { include: { subject: true } } } }, teacher: true } },
        },
        orderBy: { startDate: 'desc' },
      }),
      studentChatIds(studentId).then((chats) => chats.length),
      prisma.attendance.findMany({
        where: { studentId },
        include: { lessonSession: { include: { group: true } } },
        orderBy: { lessonSession: { date: 'desc' } },
      }),
      prisma.assessmentResult.findMany({
        where: { studentId },
        include: { assessment: { include: { category: true, group: true } } },
        orderBy: { assessment: { date: 'desc' } },
      }),
      prisma.quizAttempt.findMany({
        where: { studentId, completedAt: { not: null } },
        include: {
          quiz: { include: { lessonSession: { include: { group: true } }, _count: { select: { questions: true } } } },
        },
      }),
      prisma.payment.findMany({
        where: { studentId },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      prisma.pointTransaction.findMany({
        where: { studentId },
        include: { group: true },
        orderBy: { createdAt: 'desc' },
      }),
      getPaymentReminder(studentId),
    ])

  // Every lesson the student's groups held while they were enrolled -- the attendance
  // calendar shows a lesson day even when no attendance was marked for it.
  const lessonDays = enrollments.length
    ? await prisma.lessonSession.findMany({
        where: {
          OR: enrollments.map((e) => ({
            groupId: e.groupId,
            date: { gte: e.startDate, ...(e.endDate ? { lte: e.endDate } : {}) },
          })),
        },
        select: { id: true, date: true, group: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
      })
    : []

  const attendanceTotals = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const a of attendances) attendanceTotals[a.status] += 1

  return {
    student,
    enrollments,
    telegramLinkCount,
    attendance: {
      totals: attendanceTotals,
      rate: calculateAttendanceRate(attendances.map((a) => a.status)),
      records: attendances,
    },
    lessonDays,
    assessmentResults,
    quizResults: quizAttempts.map((a) => ({
      id: a.id,
      quizTitle: a.quiz.title,
      date: a.quiz.lessonSession.date,
      group: a.quiz.lessonSession.group,
      correctCount: a.correctCount ?? 0,
      totalQuestions: a.quiz._count.questions,
      points: a.points ?? 0,
    })),
    payments: {
      list: payments,
      outstanding: computeOutstanding(payments),
      reminder,
    },
    points: {
      total: sumPoints(pointTransactions),
      // The whole ledger (newest first) -- small per student, and the screen sums it by period.
      recent: pointTransactions,
    },
  }
}
