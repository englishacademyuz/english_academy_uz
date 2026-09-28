import { prisma } from '@tashkurgan/db'
import { ConflictError, NotFoundError } from '@tashkurgan/shared'
import { startOfUtcDay } from '../schedule/schedule'

/**
 * "Deleting" a group archives it: it leaves every list and the timetable, its
 * students are released (their enrollments end now, so they can join another
 * group), and its future is cleared -- reschedules and lessons dated after
 * today that hold no records. Everything already recorded (past lessons,
 * attendance, marks, points, payments) stays as history.
 */
export async function archiveGroup(groupId: string, now: Date = new Date()) {
  const group = await prisma.group.findUnique({ where: { id: groupId } })
  if (!group) throw new NotFoundError('Group not found')
  if (group.archivedAt) throw new ConflictError('This group has already been deleted')

  const today = startOfUtcDay(now)

  return prisma.$transaction(async (tx) => {
    await tx.enrollment.updateMany({
      where: { groupId, status: 'ACTIVE' },
      data: { status: 'ENDED', endDate: now, endReason: 'OTHER' },
    })

    await tx.lessonReschedule.deleteMany({
      where: { groupId, OR: [{ originalDate: { gt: today } }, { newDate: { gt: today } }] },
    })

    // A future lesson with attendance, a sent quiz or graded homework is a
    // record, not a plan -- those are kept.
    const futureSessions = await tx.lessonSession.findMany({
      where: {
        groupId,
        date: { gt: today },
        attendances: { none: {} },
        quizzes: { none: { status: 'SENT' } },
        OR: [{ homework: null }, { homework: { results: { none: {} } } }],
      },
      select: { id: true },
    })
    const ids = futureSessions.map((s) => s.id)
    if (ids.length > 0) {
      await tx.quiz.deleteMany({ where: { lessonSessionId: { in: ids } } })
      await tx.lessonMaterial.deleteMany({ where: { lessonSessionId: { in: ids } } })
      await tx.homework.deleteMany({ where: { lessonSessionId: { in: ids } } })
      await tx.lessonSession.deleteMany({ where: { id: { in: ids } } })
    }

    return tx.group.update({ where: { id: groupId }, data: { status: 'ARCHIVED', archivedAt: now } })
  })
}
