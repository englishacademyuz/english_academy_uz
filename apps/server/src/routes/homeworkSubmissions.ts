import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma, type Prisma } from '@tashkurgan/db'
import {
  assertCan,
  type Actor,
  HOMEWORK_TASKS,
  homeworkTasks,
  pictureTaskName,
  removeHomeworkFeedbackVoice,
  reviewHomeworkSubmission,
  setHomeworkFeedbackVoice,
  studentChatIds,
  SUBMISSION_FILES,
  SUBMISSION_TASK,
  submissionView,
  WRITTEN_TASK,
} from '@tashkurgan/domain'
import { AppError, NotFoundError, ValidationError } from '@tashkurgan/shared'
import { MAX_DOWNLOAD_BYTES, type HomeworkFileStore } from '../telegram/fileStore'

export type HomeworkReviewAnnouncement = {
  lessonId: string
  studentName: string
  date: Date
  topic: string | null
  /** The picture task's name; null for the written homework. */
  taskName: string | null
  status: 'CHECKED' | 'RETURNED'
  comment: string | null
  /** The teacher's spoken feedback (its Telegram file id), sent after the text; null when they only typed. */
  feedbackVoiceFileId: string | null
}

/** Tells a student's Telegram chats their homework was checked or sent back -- the bot in production, a spy in tests. */
export type HomeworkReviewNotifier = (chatIds: string[], review: HomeworkReviewAnnouncement) => Promise<void>

/** The caption a homework photo, voice note or video carries in Telegram -- whose it is, for which lesson and task. */
export function homeworkPhotoCaption(
  student: { firstName: string; lastName: string },
  date: Date,
  topic: string | null,
  taskName: string | null = null,
) {
  const day = date.toISOString().slice(0, 10)
  return `📝 ${student.firstName} ${student.lastName} · ${day}${topic ? ` · ${topic}` : ''}${taskName ? ` · ${taskName}` : ''}`
}

/** Streams a stored photo, voice note or video back. Its bytes never change, so browsers may keep it. */
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
  // A teacher's spoken feedback is posted as the raw recording.
  app.addContentTypeParser(/^audio\//, { parseAs: 'buffer' }, (_request, body, done) => done(null, body))

  /** A submission a teacher is about to give a verdict or feedback on, if this teacher may. */
  async function reviewableSubmission(actor: Actor, id: string) {
    const submission = await prisma.homeworkSubmission.findUnique({
      where: { id },
      include: {
        student: { select: studentSelect },
        homeworkImage: SUBMISSION_TASK.homeworkImage,
        homework: { select: { lessonSession: { select: { id: true, date: true, topic: true, group: { select: { teacherId: true } } } } } },
      },
    })
    if (!submission) throw new NotFoundError('Submission not found')
    assertCan(actor, { resource: 'homeworkResult', action: 'manage', ownerTeacherId: submission.homework.lessonSession.group.teacherId })
    return submission
  }

  // One lesson's homework: every student of the group then, with what they handed in.
  app.get('/sessions/:id/homework-submissions', { preHandler: app.authenticate }, async (request) => {
    const { id } = idParams.parse(request.params)
    const lesson = await prisma.lessonSession.findUnique({
      where: { id },
      include: {
        group: { select: { teacherId: true } },
        homework: { select: { ...HOMEWORK_TASKS, submissions: { include: { ...SUBMISSION_FILES, ...SUBMISSION_TASK } } } },
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

    // A submission from before homework was split into tasks counts as the written one's.
    const tasks = lesson.homework ? homeworkTasks(lesson.homework) : []
    if (!tasks.some((t) => t.task === WRITTEN_TASK) && submissions.some((s) => s.task === WRITTEN_TASK)) {
      tasks.unshift({ task: WRITTEN_TASK, imageId: null, name: null, dueDate: lesson.homework!.dueDate })
    }

    return {
      lessonId: lesson.id,
      date: lesson.date,
      topic: lesson.topic,
      homework: lesson.homework && { instructions: lesson.homework.instructions, dueDate: lesson.homework.dueDate },
      // What is handed in separately: the written homework and each picture, each with its deadline.
      tasks: tasks.map((t) => ({ task: t.task, imageId: t.imageId, name: t.name, dueDate: t.dueDate })),
      students: [...students.values()]
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
        .map((student) => ({
          student,
          submissions: submissions.filter((s) => s.studentId === student.id).map((s) => submissionView(s)),
        })),
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
          homeworkImage: SUBMISSION_TASK.homeworkImage,
          student: { select: studentSelect },
          homework: { select: { dueDate: true, lessonSession: { select: { id: true, date: true, topic: true } } } },
        },
      }),
      prisma.homeworkSubmission.count({ where }),
      prisma.homeworkSubmission.count({ where: { homework: { lessonSession: { groupId } }, status: 'SUBMITTED' } }),
    ])
    return {
      items: items.map((s) => ({
        ...submissionView(s),
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
    const submission = await reviewableSubmission(request.actor!, id)
    const lesson = submission.homework.lessonSession

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
          taskName: submissionView(reviewed).taskName,
          status: body.status,
          comment: reviewed.teacherComment,
          feedbackVoiceFileId: reviewed.feedbackVoice?.telegramFileId ?? null,
        }),
      )
      .catch((err) => request.log.error({ err, submissionId: id }, 'Homework review notice failed'))
    return submissionView(reviewed)
  })

  // Spoken feedback, recorded in the review screen: kept on the submission until the verdict sends it.
  app.post(
    '/homework-submissions/:id/feedback-voice',
    { preHandler: app.authenticate, bodyLimit: MAX_DOWNLOAD_BYTES },
    async (request) => {
      const { id } = idParams.parse(request.params)
      const body = request.body
      const contentType = request.headers['content-type'] ?? ''
      if (!Buffer.isBuffer(body) || !contentType.startsWith('audio/')) throw new ValidationError('Send an audio recording')
      if (!opts.fileStore) throw new AppError('File storage is not configured', 503)
      const submission = await reviewableSubmission(request.actor!, id)
      const lesson = submission.homework.lessonSession
      const taskName = submission.homeworkImage && pictureTaskName(submission.homeworkImage)
      const stored = await opts.fileStore.uploadVoice(body, {
        caption: `🎙 Ustoz izohi · ${homeworkPhotoCaption(submission.student, lesson.date, lesson.topic, taskName)}`,
        contentType,
      })
      return submissionView(await setHomeworkFeedbackVoice(id, stored))
    },
  )

  app.delete('/homework-submissions/:id/feedback-voice', { preHandler: app.authenticate }, async (request) => {
    const { id } = idParams.parse(request.params)
    await reviewableSubmission(request.actor!, id)
    return submissionView(await removeHomeworkFeedbackVoice(id))
  })

  const ownerTeacher = {
    submission: { select: { homework: { select: { lessonSession: { select: { group: { select: { teacherId: true } } } } } } } },
  } satisfies Prisma.HomeworkPhotoInclude & Prisma.HomeworkVoiceInclude & Prisma.HomeworkVideoInclude & Prisma.HomeworkFeedbackVoiceInclude

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

  app.get('/homework-videos/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParams.parse(request.params)
    const video = await prisma.homeworkVideo.findUnique({ where: { id }, include: ownerTeacher })
    if (!video) throw new NotFoundError('Video not found')
    assertCan(request.actor!, {
      resource: 'lessonSession',
      action: 'view',
      ownerTeacherId: video.submission.homework.lessonSession.group.teacherId,
    })
    return sendHomeworkFile(reply, opts.fileStore, video.telegramFileId)
  })

  app.get('/homework-feedback-voices/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParams.parse(request.params)
    const voice = await prisma.homeworkFeedbackVoice.findUnique({ where: { id }, include: ownerTeacher })
    if (!voice) throw new NotFoundError('Voice note not found')
    assertCan(request.actor!, {
      resource: 'lessonSession',
      action: 'view',
      ownerTeacherId: voice.submission.homework.lessonSession.group.teacherId,
    })
    return sendHomeworkFile(reply, opts.fileStore, voice.telegramFileId)
  })
}
