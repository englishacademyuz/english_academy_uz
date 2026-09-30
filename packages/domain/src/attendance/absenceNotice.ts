import { prisma } from '@tashkurgan/db'

/** A student's most recent lesson, when they were marked absent from it. */
export type LatestAbsence = {
  attendanceId: string
  date: Date
  groupName: string
  notifiedAt: Date | null
}

/**
 * Each student's latest recorded attendance, kept only when it's ABSENT -- the students list shows
 * a "missed the lesson" button until they come to a later lesson.
 */
export async function getLatestAbsences(studentIds: string[]): Promise<Map<string, LatestAbsence>> {
  const latest = await prisma.attendance.findMany({
    where: { studentId: { in: studentIds } },
    orderBy: { lessonSession: { date: 'desc' } },
    distinct: ['studentId'],
    select: {
      id: true,
      studentId: true,
      status: true,
      absenceNotifiedAt: true,
      lessonSession: { select: { date: true, group: { select: { name: true } } } },
    },
  })
  const result = new Map<string, LatestAbsence>()
  for (const a of latest) {
    if (a.status !== 'ABSENT') continue
    result.set(a.studentId, {
      attendanceId: a.id,
      date: a.lessonSession.date,
      groupName: a.lessonSession.group.name,
      notifiedAt: a.absenceNotifiedAt,
    })
  }
  return result
}

export async function markAbsenceNotified(attendanceId: string, at: Date = new Date()) {
  return prisma.attendance.update({ where: { id: attendanceId }, data: { absenceNotifiedAt: at } })
}
