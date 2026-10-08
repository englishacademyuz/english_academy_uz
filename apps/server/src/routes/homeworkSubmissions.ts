import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma, type Prisma } from '@tashkurgan/db'
import { assertCan, reviewHomeworkSubmission, studentChatIds, submissionView, SUBMISSION_FILES } from '@tashkurgan/domain'
import { AppError, NotFoundError } from '@tashkurgan/shared'
import type { HomeworkFileStore } from '../telegram/fileStore'

export type HomeworkReviewAnnouncement = {
  lessonId: string
  studentName: string
  date: Date
  topic: string | null
  status: 'CHECKED' | 'RETURNED'
  comment: string | null
}

/** Tells a student's Telegram chats their homework was checked or sent back -- the bot in production, a spy in tests. */
export type HomeworkReviewNotifier = (chatIds: string[], review: HomeworkReviewAnnouncement) => Promise<void>

/** The caption a homework photo or voice note carries in Telegram -- whose it is and for which lesson. */
export function homeworkPhotoCaption(student: { firstName: string; lastName: string }, date: Date, topic: string | null) {
  const day = date.toISOString().slice(0, 10)
  return `📝 ${student.firstName} ${student.lastName} · ${day}${topic ? ` · ${topic}` : ''}`
}

/** Streams a stored photo or voice note back. Its bytes never change, so browsers may keep it. */
export async function sendHomeworkFile(reply: FastifyReply, store: HomeworkFileStore | undefined, fileId: string) {
  if (!store) throw new AppError('File storage is not configured', 503)
  const { body, contentType } = await store.download(fileId)
  return reply.header('content-type', contentType).header('cache-control', 'private, max-age=604800, immutable').send(body)
}

const PAGE_SIZE = 30
const idParams = z.object({ id: z.string() })
const groupIdParams = z.object({ groupId: z.string() })
const feedQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().optional(),
  status: z.enum(['SUBMITTED', 'CHECKED', 'RETURNED']).optional(),
  page: z.coerce.number().int().min(0).default(0),
})
const reviewBody = z.object({
  status: z.enum(['CHECKED', 'RETURNED']),
  comment: z.string().max(1000).nullable().optional(),
})

const studentSelect = { id: true, firstName: true, lastName: true } satisfies Prisma.StudentSelect

export const homeworkSubmissionRoutes: FastifyPluginAsync<{
  fileStore?: HomeworkFileStore
  notifier?: HomeworkReviewNotifier
}> = async (app, opts) => {
  const notifier: HomeworkReviewNotifier = opts.notifier ?? (async () => {})

  // One lesson's homework: every student of the group then, with what they handed in.
  app.get('/sessions/:id/homework-submissions', { preHandler: app.authenticate }, async (request) => {
    const { id } = idParams.parse(request.params)
    const lesson = await prisma.lessonSession.findUnique({
      where: { id },
      include: {
        group: { select: { teacherId: true } },
        homework: { include: { submissions: { include: SUBMISSION_FILES } } },
      },
    })
    if (!lesson) throw new NotFoundError('Session not found')
    assertCan(request.actor!, { resource: 'lessonSession', action: 'view', ownerTeacherId: lesson.group.teacherId })

    const dayEnd = new Date(lesson.date.getTime() + 86_400_000)
    const enrollments = await prisma.enrollment.findMany({
      where: {
        groupId: lesson.groupId,
        startDate: { lt: dayEnd },
        OR: [{ endDate: null }, { endDate: { gte: lesson.date } }],
      },
      select: { student: { select: studentSelect } },
    })
    const submissions = lesson.homework?.submissions ?? []
    const submitters = submissions.length
      ? await prisma.student.findMany({ where: { id: { in: submissions.map((s) => s.studentId) } }, select: studentSelect })
      : []
    const students = new Map([...enrollments.map((e) => e.student), ...submitters].map((s) => [s.id, s]))

    return {
      lessonId: lesson.id,
      date: lesson.date,
      topic: lesson.topic,
      homework: lesson.homework && { instructions: lesson.homework.instructions, dueDate: lesson.homework.dueDate },
      students: [...students.values()]
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
        .map((student) => {
          const submission = submissions.find((s) => s.studentId === student.id)
          return { student, submission: submission ? submissionView(submission, lesson.homework!.dueDate) : null }
        }),
    }
  })

  // Every submission of the group, newest first -- filtered by when it came in, topic/name, status.
  app.get('/groups/:groupId/homework-submissions', { preHandler: app.authenticate }, async (request) => {
    const { groupId } = groupIdParams.parse(request.params)
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { teacherId: true } })
    if (!group) throw new NotFoundError('Group not found')
    assertCan(request.actor!, { resource: 'lessonSession', action: 'view', ownerTeacherId: group.teacherId })

    const { from, to, q, status, page } = feedQuery.parse(request.query)
    const where: Prisma.HomeworkSubmissionWhereInput = {
      homework: { lessonSession: { groupId } },
      ...(status ? { status } : {}),
      ...(from || to ? { submittedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      ...(q
        ? {
            OR: [
              { homework: { lessonSession: { topic: { contains: q, mode: 'insensitive' } } } },
              { student: { firstName: { contains: q, mode: 'insensitive' } } },
              { student: { lastName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [items, total, unchecked] = await Promise.all([
      prisma.homeworkSubmission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          ...SUBMISSION_FILES,
          student: { select: studentSelect },
          homework: { select: { dueDate: true, lessonSession: { select: { id: true, date: true, topic: true } } } },
        },
      }),
      prisma.homeworkSubmission.count({ where }),
      prisma.homeworkSubmission.count({ where: { homework: { lessonSession: { groupId } }, status: 'SUBMITTED' } }),
    ])
    return {
      items: items.map((s) => ({
        ...submissionView(s, s.homework.dueDate),
        student: s.student,
        lesson: s.homework.lessonSession,
      })),
      hasMore: (page + 1) * PAGE_SIZE < total,
      uncheckedCount: unchecked,
    }
  })

  // Submissions waiting for a teacher, per group -- the badges on the groups list and the dashboard.
  app.get('/homework-submissions/unchecked', { preHandler: app.authenticate }, async (request) => {
    const actor = request.actor!
    const rows = await prisma.homeworkSubmission.findMany({
      where: {
        status: 'SUBMITTED',
        homework: {
          lessonSession: { group: { archivedAt: null, ...(actor.role === 'TEACHER' ? { teacherId: actor.teacherId } : {}) } },
        },
      },
      select: { homework: { select: { lessonSession: { select: { groupId: true } } } } },
    })
    const byGroup: Record<string, number> = {}
    for (const row of rows) {
      const groupId = row.homework.lessonSession.groupId
      byGroup[groupId] = (byGroup[groupId] ?? 0) + 1
    }
    return { total: rows.length, byGroup }
  })

  app.post('/homework-submissions/:id/review', { preHandler: app.authenticate }, async (request) => {
    const { id } = idParams.parse(request.params)
    const submission = await prisma.homeworkSubmission.findUnique({
      where: { id },
      include: {
        student: { select: studentSelect },
        homework: { select: { lessonSession: { select: { id: true, date: true, topic: true, group: { select: { teacherId: true } } } } } },
      },
    })
    if (!submission) throw new NotFoundError('Submission not found')
    const lesson = submission.homework.lessonSession
    assertCan(request.actor!, { resource: 'homeworkResult', action: 'manage', ownerTeacherId: lesson.group.teacherId })

    const body = reviewBody.parse(request.body)
    const reviewed = await reviewHomeworkSubmission(id, body)
    // Sent in the background -- a slow Telegram call mustn't fail the review.
    studentChatIds(submission.studentId)
      .then((chatIds) =>
        notifier(chatIds, {
          lessonId: lesson.id,
          studentName: `${submission.student.firstName} ${submission.student.lastName}`,
          date: lesson.date,
          topic: lesson.topic,
          status: body.status,
          comment: reviewed.teacherComment,
        }),
      )
      .catch((err) => request.log.error({ err, submissionId: id }, 'Homework review notice failed'))
    return submissionView(reviewed, reviewed.homework.dueDate)
  })

  const ownerTeacher = {
    submission: { select: { homework: { select: { lessonSession: { select: { group: { select: { teacherId: true } } } } } } } },
  } satisfies Prisma.HomeworkPhotoInclude & Prisma.HomeworkVoiceInclude

  app.get('/homework-photos/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParams.parse(request.params)
    const photo = await prisma.homeworkPhoto.findUnique({ where: { id }, include: ownerTeacher })
    if (!photo) throw new NotFoundError('Photo not found')
    assertCan(request.actor!, {
      resource: 'lessonSession',
      action: 'view',
      ownerTeacherId: photo.submission.homework.lessonSession.group.teacherId,
    })
    return sendHomeworkFile(reply, opts.fileStore, photo.telegramFileId)
  })

  app.get('/homework-voices/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParams.parse(request.params)
    const voice = await prisma.homeworkVoice.findUnique({ where: { id }, include: ownerTeacher })
    if (!voice) throw new NotFoundError('Voice note not found')
    assertCan(request.actor!, {
      resource: 'lessonSession',
      action: 'view',
      ownerTeacherId: voice.submission.homework.lessonSession.group.teacherId,
    })
    return sendHomeworkFile(reply, opts.fileStore, voice.telegramFileId)
  })
}
