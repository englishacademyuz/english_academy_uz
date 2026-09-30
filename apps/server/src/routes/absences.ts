import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, markAbsenceNotified, studentChatIds } from '@tashkurgan/domain'
import { NotFoundError, ValidationError } from '@tashkurgan/shared'

export type AbsenceAnnouncement = { studentName: string; groupName: string; date: Date }

/** Tells a student's Telegram chats they missed a lesson -- the bot in production, a no-op or spy in tests. */
export type AbsenceNotifier = (chatIds: string[], absence: AbsenceAnnouncement) => Promise<void>

const attendanceParams = z.object({ id: z.string() })

export const absenceRoutes: FastifyPluginAsync<{ notifier?: AbsenceNotifier }> = async (app, opts) => {
  const notifier: AbsenceNotifier = opts.notifier ?? (async () => {})

  // The "didn't come to the lesson" button on the students list. Only the group's teacher (or an
  // admin) may send it. Sends in the background (a slow Telegram call mustn't fail the request).
  app.post('/attendances/:id/absence-notice', { preHandler: app.authenticate }, async (request) => {
    const { id } = attendanceParams.parse(request.params)
    const attendance = await prisma.attendance.findUnique({
      where: { id },
      include: {
        student: { select: { firstName: true, lastName: true } },
        lessonSession: { select: { date: true, group: { select: { name: true, teacherId: true } } } },
      },
    })
    if (!attendance) throw new NotFoundError('Attendance not found')
    assertCan(request.actor!, {
      resource: 'lessonSession',
      action: 'manage',
      ownerTeacherId: attendance.lessonSession.group.teacherId,
    })
    if (attendance.status !== 'ABSENT') throw new ValidationError('The student was not absent from this lesson')

    const chatIds = await studentChatIds(attendance.studentId)
    notifier(chatIds, {
      studentName: `${attendance.student.firstName} ${attendance.student.lastName}`,
      groupName: attendance.lessonSession.group.name,
      date: attendance.lessonSession.date,
    }).catch((err) => request.log.error({ err, attendanceId: id }, 'Absence notice failed'))
    const updated = await markAbsenceNotified(id)
    return { notifiedChats: chatIds.length, notifiedAt: updated.absenceNotifiedAt }
  })
}
