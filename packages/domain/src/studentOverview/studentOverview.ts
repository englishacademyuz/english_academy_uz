import { prisma } from '@tashkurgan/db'
import { NotFoundError } from '@tashkurgan/shared'
import { calculateAttendanceRate } from '../attendance/attendance'
import { computeOutstanding } from '../payment/payment'
import { sumPoints } from '../points/points'

const RECENT_ATTENDANCE_LIMIT = 60
const RECENT_POINTS_LIMIT = 50

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

  const [enrollments, parentLinks, attendances, assessmentResults, homeworkResults, payments, pointTransactions] =
    await Promise.all([
      prisma.enrollment.findMany({
        where: { studentId },
        include: {
          group: { include: { level: { include: { course: { include: { subject: true } } } }, teacher: true } },
        },
        orderBy: { startDate: 'desc' },
      }),
      prisma.parentStudentLink.findMany({
        where: { studentId, unlinkedAt: null },
        include: { parent: true },
      }),
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
      prisma.homeworkResult.findMany({
        where: { studentId },
        include: { homework: { include: { lessonSession: { include: { group: true } } } } },
        orderBy: { createdAt: 'desc' },
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
    ])

  const attendanceTotals = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const a of attendances) attendanceTotals[a.status] += 1

  return {
    student,
    enrollments,
    parents: parentLinks,
    attendance: {
      totals: attendanceTotals,
      rate: calculateAttendanceRate(attendances.map((a) => a.status)),
      recent: attendances.slice(0, RECENT_ATTENDANCE_LIMIT),
    },
    assessmentResults,
    homeworkResults,
    payments: {
      list: payments,
      outstanding: computeOutstanding(payments),
    },
    points: {
      total: sumPoints(pointTransactions),
      recent: pointTransactions.slice(0, RECENT_POINTS_LIMIT),
    },
  }
}
