import { prisma, type AttendanceStatus, type StudentStatus } from '@tashkurgan/db'
import { calculateAttendanceRate } from '../attendance/attendance'
import { getLatestAbsences } from '../attendance/absenceNotice'
import { getPaymentReminders } from '../payment/payment'

/**
 * The students list screen: each student with their current group (and its
 * level color), all-time Rating points, attendance totals, a missed latest lesson and payment reminder --
 * aggregated in a few grouped queries rather than per student, so the list stays one fast call.
 */
export async function listStudentsWithStats(filter: { status?: StudentStatus } = {}) {
  const students = await prisma.student.findMany({
    where: filter.status ? { status: filter.status } : undefined,
    include: {
      enrollments: {
        where: { status: 'ACTIVE' },
        include: { group: { select: { id: true, name: true, level: { select: { name: true, color: true } } } } },
        orderBy: { startDate: 'desc' },
      },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
  const ids = students.map((s) => s.id)

  const [pointSums, attendanceCounts, reminders, absences] = await Promise.all([
    prisma.pointTransaction.groupBy({ by: ['studentId'], where: { studentId: { in: ids } }, _sum: { points: true } }),
    prisma.attendance.groupBy({ by: ['studentId', 'status'], where: { studentId: { in: ids } }, _count: { _all: true } }),
    getPaymentReminders(ids),
    getLatestAbsences(ids),
  ])

  const pointsBy = new Map(pointSums.map((p) => [p.studentId, p._sum.points ?? 0]))
  const attendanceBy = new Map<string, Record<AttendanceStatus, number>>()
  for (const row of attendanceCounts) {
    const totals = attendanceBy.get(row.studentId) ?? { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 }
    totals[row.status] = row._count._all
    attendanceBy.set(row.studentId, totals)
  }

  return students.map(({ enrollments, ...student }) => {
    const totals = attendanceBy.get(student.id) ?? { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 }
    const statuses = (Object.keys(totals) as AttendanceStatus[]).flatMap((s) => Array<AttendanceStatus>(totals[s]).fill(s))
    return {
      ...student,
      groups: enrollments.map((e) => e.group),
      points: pointsBy.get(student.id) ?? 0,
      attendance: { totals, rate: calculateAttendanceRate(statuses) },
      paymentReminder: reminders.get(student.id) ?? null,
      lastAbsence: absences.get(student.id) ?? null,
    }
  })
}
