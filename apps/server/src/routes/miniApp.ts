import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma, type AttendanceStatus } from '@tashkurgan/db'
import {
  addHomeworkPhoto,
  answerQuizQuestion,
  assertCanAddHomeworkPhoto,
  HOMEWORK_WITH_IMAGES,
  MAX_HOMEWORK_PHOTOS,
  removeHomeworkPhoto,
  submissionView,
  familyUnreadCount,
  calculateAttendanceRate,
  getGroupLeaderboard,
  getPaymentReminder,
  getFamilyThread,
  getProgress,
  listQuizzesForStudent,
  placesByPoints,
  postFamilyMessage,
  startQuizAttempt,
  sumPoints,
  toPercentage,
  upcomingReschedules,
} from '@tashkurgan/domain'
import { AppError, NotFoundError, ValidationError } from '@tashkurgan/shared'
import { telegramDisplayName } from '../telegram/initData'
import { isSupportedImage, type HomeworkFileStore } from '../telegram/fileStore'
import { homeworkPhotoCaption, sendHomeworkPhoto } from './homeworkSubmissions'

/**
 * The Telegram Mini App's API. Every route is scoped to `request.student`,
 * which `authenticateStudent` resolves from verified Telegram init data --
 * no route accepts a student id, so one student can never ask for another's
 * data. Ids that do appear (a lesson, a quiz, an attempt) are re-checked
 * against the student's own enrollments/attempts before anything is returned.
 */

const LESSONS_PAGE_SIZE = 20
const idParams = z.object({ id: z.string() })
const pageQuery = z.object({ page: z.coerce.number().int().min(0).default(0) })
const progressQuery = z.object({ kind: z.enum(['today', 'week', 'month']).default('month') })
const monthQuery = z.object({ year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12) })
const answerBody = z.object({ optionId: z.string() })
const chatMessageBody = z.object({ text: z.string() })
/** A phone photo the app has shrunk is well under 1 MB; this leaves room for an unshrunk one. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const me = (request: FastifyRequest) => request.student!

async function activeEnrollment(studentId: string) {
  return prisma.enrollment.findFirst({
    where: { studentId, status: 'ACTIVE' },
    include: { group: { include: { level: true, teacher: true } } },
    orderBy: { startDate: 'desc' },
  })
}

function groupSummary(enrollment: Awaited<ReturnType<typeof activeEnrollment>>) {
  if (!enrollment) return null
  const { group } = enrollment
  return {
    name: group.name,
    level: group.level.name,
    levelColor: group.level.color,
    teacher: group.teacher.fullName,
    teacherPhone: group.teacher.phone,
    scheduleDays: group.scheduleDays,
    scheduleTime: group.scheduleTime,
  }
}

/** Groups (current or past) the student was enrolled in -- what "their" lessons are drawn from. */
async function enrolledGroupIds(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({ where: { studentId }, select: { groupId: true } })
  return [...new Set(enrollments.map((e) => e.groupId))]
}

export const miniAppRoutes: FastifyPluginAsync<{ fileStore?: HomeworkFileStore }> = async (app, opts) => {
  app.addHook('preHandler', app.authenticateStudent)
  // Homework photos are posted as the raw image bytes.
  app.addContentTypeParser(['image/jpeg', 'image/png', 'image/webp'], { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  )

  // Bosh sahifa: everything the home screen needs in one call.
  app.get('/student/home', async (request) => {
    const student = me(request)
    const enrollment = await activeEnrollment(student.id)
    const now = new Date()

    const [lastLesson, latestHomework, quizzes, progress, points, changes, ranking, payment, unreadChat] = await Promise.all([
      enrollment
        ? prisma.lessonSession.findFirst({
            where: { groupId: enrollment.groupId, date: { lte: now } },
            orderBy: { date: 'desc' },
            select: { id: true, date: true, topic: true },
          })
        : null,
      enrollment
        ? prisma.lessonSession.findFirst({
            where: { groupId: enrollment.groupId, homework: { isNot: null } },
            orderBy: { date: 'desc' },
            select: {
              id: true,
              date: true,
              topic: true,
              homework: { select: { instructions: true, dueDate: true, images: HOMEWORK_WITH_IMAGES.include.images } },
            },
          })
        : null,
      listQuizzesForStudent(student.id, now),
      getProgress(student.id, { kind: 'month' }),
      prisma.pointTransaction.findMany({ where: { studentId: student.id }, select: { points: true } }),
      scheduleChanges(enrollment),
      groupRanking(enrollment, student.id),
      getPaymentReminder(student.id),
      familyUnreadCount(student.id),
    ])

    return {
      student: { firstName: student.firstName, lastName: student.lastName },
      group: groupSummary(enrollment),
      scheduleChanges: changes,
      lastLesson,
      latestHomework: latestHomework?.homework
        ? { lessonId: latestHomework.id, date: latestHomework.date, topic: latestHomework.topic, ...latestHomework.homework }
        : null,
      openQuizzes: quizzes.filter((q) => q.isOpen && !q.attempt?.completed),
      monthProgress: progress,
      totalPoints: sumPoints(points),
      groupRanking: ranking,
      // Upcoming or overdue payment -- null when nothing is due within three days.
      payment: payment && {
        stage: payment.stage,
        dueDate: payment.dueDate,
        daysLeft: payment.daysLeft,
        unpaidCycles: payment.unpaidCycles,
        amount: payment.amount,
      },
      // Teacher answers not yet opened in the Mini App's chat.
      unreadChat,
    }
  })

  app.get('/student/lessons', async (request) => {
    const student = me(request)
    const { page } = pageQuery.parse(request.query)
    const enrollment = await activeEnrollment(student.id)
    if (!enrollment) return { group: null, scheduleChanges: [], lessons: [], hasMore: false }

    const where = { groupId: enrollment.groupId, date: { lte: new Date() } }
    const [lessons, total, changes] = await Promise.all([
      prisma.lessonSession.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: page * LESSONS_PAGE_SIZE,
        take: LESSONS_PAGE_SIZE,
        select: {
          id: true,
          date: true,
          topic: true,
          homework: { select: { id: true } },
          _count: { select: { materials: true } },
        },
      }),
      prisma.lessonSession.count({ where }),
      page === 0 ? scheduleChanges(enrollment) : [],
    ])
    return {
      group: groupSummary(enrollment),
      scheduleChanges: changes,
      lessons: lessons.map((l) => ({
        id: l.id,
        date: l.date,
        topic: l.topic,
        materialCount: l._count.materials,
        hasHomework: !!l.homework,
      })),
      hasMore: (page + 1) * LESSONS_PAGE_SIZE < total,
    }
  })

  app.get('/student/lessons/:id', async (request) => {
    const student = me(request)
    const { id } = idParams.parse(request.params)
    const groupIds = await enrolledGroupIds(student.id)
    const lesson = await prisma.lessonSession.findFirst({
      where: { id, groupId: { in: groupIds } },
      include: {
        materials: true,
        homework: {
          include: {
            ...HOMEWORK_WITH_IMAGES.include,
            submissions: { where: { studentId: student.id }, include: { photos: true } },
          },
        },
        group: { select: { name: true, homeworkSubmissionEnabled: true } },
      },
    })
    // Same answer for "doesn't exist" and "not yours" -- nothing to probe.
    if (!lesson) throw new NotFoundError('Lesson not found')
    return {
      id: lesson.id,
      date: lesson.date,
      topic: lesson.topic,
      group: lesson.group.name,
      // The teacher's explanation of the lesson ("Tushuntirish"), as the editor's HTML.
      notes: lesson.notes,
      materials: lesson.materials.map((m) => ({ id: m.id, type: m.type, content: m.content })),
      homework: lesson.homework
        ? {
            instructions: lesson.homework.instructions,
            dueDate: lesson.homework.dueDate,
            images: lesson.homework.images,
            submissionEnabled: lesson.group.homeworkSubmissionEnabled,
            submission: lesson.homework.submissions[0]
              ? submissionView(lesson.homework.submissions[0], lesson.homework.dueDate)
              : null,
          }
        : null,
    }
  })

  app.get('/student/homework', async (request) => {
    const student = me(request)
    const enrollment = await activeEnrollment(student.id)
    if (!enrollment) return []
    const lessons = await prisma.lessonSession.findMany({
      where: { groupId: enrollment.groupId, homework: { isNot: null } },
      orderBy: { date: 'desc' },
      take: 30,
      select: {
        id: true,
        date: true,
        topic: true,
        homework: {
          select: {
            instructions: true,
            dueDate: true,
            images: HOMEWORK_WITH_IMAGES.include.images,
            submissions: { where: { studentId: student.id }, include: { photos: { orderBy: { createdAt: 'asc' } } } },
          },
        },
      },
    })
    const submissionEnabled = enrollment.group.homeworkSubmissionEnabled
    return lessons.map((l) => {
      const { submissions, ...homework } = l.homework!
      return {
        lessonId: l.id,
        date: l.date,
        topic: l.topic,
        ...homework,
        submissionEnabled,
        submission: submissions[0] ? submissionView(submissions[0], homework.dueDate) : null,
      }
    })
  })

  // Topshirish: one homework with the student's own photos for it.
  app.get('/student/homework/:id', async (request) => {
    const student = me(request)
    const { id } = idParams.parse(request.params)
    const groupIds = await enrolledGroupIds(student.id)
    const lesson = await prisma.lessonSession.findFirst({
      where: { id, groupId: { in: groupIds }, homework: { isNot: null } },
      include: {
        group: { select: { name: true, homeworkSubmissionEnabled: true } },
        homework: {
          include: {
            ...HOMEWORK_WITH_IMAGES.include,
            submissions: { where: { studentId: student.id }, include: { photos: { orderBy: { createdAt: 'asc' } } } },
          },
        },
      },
    })
    if (!lesson?.homework) throw new NotFoundError('Homework not found')
    const submission = lesson.homework.submissions[0]
    return {
      lessonId: lesson.id,
      date: lesson.date,
      topic: lesson.topic,
      group: lesson.group.name,
      instructions: lesson.homework.instructions,
      dueDate: lesson.homework.dueDate,
      images: lesson.homework.images,
      submissionEnabled: lesson.group.homeworkSubmissionEnabled,
      maxPhotos: MAX_HOMEWORK_PHOTOS,
      submission: submission ? submissionView(submission, lesson.homework.dueDate) : null,
    }
  })

  // One photo per request (the app compresses it first), so a slow connection loses at most one.
  app.post('/student/homework/:id/photos', { bodyLimit: MAX_UPLOAD_BYTES }, async (request) => {
    const student = me(request)
    const { id } = idParams.parse(request.params)
    const body = request.body
    if (!Buffer.isBuffer(body) || !isSupportedImage(body)) throw new ValidationError('Send a JPEG, PNG or WebP photo')
    if (!opts.fileStore) throw new AppError('Photo uploads are not configured', 503)

    const { lesson } = await assertCanAddHomeworkPhoto(student.id, id)
    const stored = await opts.fileStore.upload(body, {
      ownerChatId: String(request.telegramUser!.id),
      caption: homeworkPhotoCaption(student, lesson.date, lesson.topic),
    })
    const submission = await addHomeworkPhoto(student.id, id, stored)
    return submissionView(submission, submission.homework.dueDate)
  })

  app.delete('/student/homework-photos/:id', async (request) => {
    const { id } = idParams.parse(request.params)
    const submission = await removeHomeworkPhoto(me(request).id, id)
    return { submission: submission && submissionView(submission, submission.homework.dueDate) }
  })

  app.get('/student/homework-photos/:id', async (request, reply) => {
    const student = me(request)
    const { id } = idParams.parse(request.params)
    const photo = await prisma.homeworkPhoto.findFirst({ where: { id, submission: { studentId: student.id } } })
    if (!photo) throw new NotFoundError('Photo not found')
    return sendHomeworkPhoto(reply, opts.fileStore, photo.telegramFileId)
  })

  // A picture the teacher gave with homework -- for any group the student is or was in.
  app.get('/student/homework-images/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params)
    const groupIds = await enrolledGroupIds(me(request).id)
    const image = await prisma.homeworkImage.findFirst({
      where: { id, groupId: { in: groupIds }, homeworkId: { not: null } },
      select: { telegramFileId: true },
    })
    if (!image) throw new NotFoundError('Image not found')
    return sendHomeworkPhoto(reply, opts.fileStore, image.telegramFileId)
  })

  app.get('/student/progress', async (request) => {
    const student = me(request)
    const { kind } = progressQuery.parse(request.query)
    const snapshot = await getProgress(student.id, { kind })
    const { start, end } = snapshotRange(kind)
    const marks = await marksBetween(student.id, start, end)

    // Homework is marked through assessments now, so its separate rate isn't reported.
    return {
      timeframe: snapshot.timeframe,
      attendanceRate: snapshot.attendanceRate,
      quizAverage: snapshot.quizAverage,
      academicByCategory: snapshot.academicByCategory,
      points: snapshot.points,
      marks,
    }
  })

  app.get('/student/attendance', async (request) => {
    const student = me(request)
    const { year, month } = monthQuery.parse(request.query)
    const start = new Date(Date.UTC(year, month - 1, 1))
    const end = new Date(Date.UTC(year, month, 1))

    const enrollments = await prisma.enrollment.findMany({ where: { studentId: student.id } })
    const [lessons, records, marks] = await Promise.all([
      enrollments.length
        ? prisma.lessonSession.findMany({
            where: {
              date: { gte: start, lt: end, lte: new Date() },
              OR: enrollments.map((e) => ({
                groupId: e.groupId,
                date: { gte: e.startDate, ...(e.endDate ? { lte: e.endDate } : {}) },
              })),
            },
            select: { id: true, date: true, topic: true, group: { select: { name: true } } },
            orderBy: { date: 'desc' },
          })
        : [],
      prisma.attendance.findMany({
        where: { studentId: student.id, lessonSession: { date: { gte: start, lt: end } } },
        select: { status: true, lessonSessionId: true },
      }),
      // The Kundalik calendar puts each mark on its day, next to that day's attendance.
      marksBetween(student.id, start, new Date(end.getTime() - 1)),
    ])
    const statusByLesson = new Map(records.map((r) => [r.lessonSessionId, r.status]))
    const totals: Record<AttendanceStatus, number> = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 }
    for (const r of records) totals[r.status] += 1

    return {
      rate: calculateAttendanceRate(records.map((r) => r.status)),
      totals,
      days: lessons.map((l) => ({
        lessonId: l.id,
        date: l.date,
        topic: l.topic,
        group: l.group.name,
        status: statusByLesson.get(l.id) ?? null,
      })),
      marks,
    }
  })

  // Kundalik "Butun yil": one row per month of the current academic year (from 1 September), up to this month.
  app.get('/student/attendance/year', async (request) => {
    const student = me(request)
    const now = new Date()
    const firstYear = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
    const start = new Date(Date.UTC(firstYear, 8, 1))

    const [records, marks] = await Promise.all([
      prisma.attendance.findMany({
        where: { studentId: student.id, lessonSession: { date: { gte: start, lte: now } } },
        select: { status: true, lessonSession: { select: { date: true } } },
      }),
      marksBetween(student.id, start, now),
    ])

    const monthKey = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth()
    const months = []
    for (let key = monthKey(start); key <= monthKey(now); key++) {
      const statuses = records.filter((r) => monthKey(r.lessonSession.date) === key).map((r) => r.status)
      const scores = marks
        .filter((m) => monthKey(m.date) === key && m.maxScore > 0)
        .map((m) => toPercentage(m.score, m.maxScore))
      const counted = statuses.filter((s) => s !== 'EXCUSED')
      months.push({
        year: Math.floor(key / 12),
        month: (key % 12) + 1,
        lessons: counted.length,
        attended: counted.filter((s) => s === 'PRESENT' || s === 'LATE').length,
        attendanceRate: calculateAttendanceRate(statuses),
        markAverage: scores.length ? scores.reduce((sum, v) => sum + v, 0) / scores.length : null,
      })
    }
    return { months: months.reverse() }
  })

  app.get('/student/profile', async (request) => {
    const student = me(request)
    const [enrollment, points, linkedAccounts] = await Promise.all([
      activeEnrollment(student.id),
      prisma.pointTransaction.findMany({ where: { studentId: student.id }, select: { points: true } }),
      prisma.telegramLink.count({ where: { studentId: student.id } }),
    ])
    return {
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        dob: student.dob,
        phone: student.phone,
        status: student.status,
      },
      group: groupSummary(enrollment),
      memberSince: enrollment?.startDate ?? null,
      totalPoints: sumPoints(points),
      linkedAccounts,
    }
  })

  app.get('/student/quizzes', async (request) => listQuizzesForStudent(me(request).id))

  app.post('/student/quizzes/:id/start', async (request) => {
    const { id } = idParams.parse(request.params)
    return startQuizAttempt(id, me(request).id)
  })

  app.post('/student/quiz-attempts/:id/answer', async (request) => {
    const { id } = idParams.parse(request.params)
    const { optionId } = answerBody.parse(request.body)
    return answerQuizQuestion(id, optionId, me(request).id)
  })

  // Oʻqituvchi bilan muloqot: the family's thread with the teacher. Opening it marks the teacher's answers seen.
  app.get('/student/chat', async (request) => {
    const student = me(request)
    const [enrollment, messages] = await Promise.all([
      activeEnrollment(student.id),
      getFamilyThread(student.id, String(request.telegramUser!.id)),
    ])
    return {
      teacher: enrollment ? { name: enrollment.group.teacher.fullName, phone: enrollment.group.teacher.phone } : null,
      messages,
    }
  })

  app.post('/student/chat/messages', async (request) => {
    const student = me(request)
    const { text } = chatMessageBody.parse(request.body)
    const user = request.telegramUser!
    const { message } = await postFamilyMessage({
      studentId: student.id,
      chatId: String(user.id),
      senderName: telegramDisplayName(user),
      text,
    })
    return { id: message.id, fromFamily: true, mine: true, senderName: message.senderName, text: message.text, createdAt: message.createdAt }
  })
}

/** Same calendar ranges getProgress uses for today/week/month. */
function snapshotRange(kind: 'today' | 'week' | 'month') {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (kind === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  if (kind === 'month') start.setDate(1)
  return { start, end: now }
}

/** Every assessment result and finished quiz dated in [start, end], newest first. */
async function marksBetween(studentId: string, start: Date, end: Date) {
  const [assessmentResults, quizAttempts] = await Promise.all([
    prisma.assessmentResult.findMany({
      where: { studentId, assessment: { date: { gte: start, lte: end } } },
      include: { assessment: { include: { category: true } } },
    }),
    prisma.quizAttempt.findMany({
      where: { studentId, completedAt: { not: null }, quiz: { lessonSession: { date: { gte: start, lte: end } } } },
      include: { quiz: { include: { lessonSession: true, _count: { select: { questions: true } } } } },
    }),
  ])

  return [
    ...assessmentResults.map((r) => ({
      id: r.id,
      kind: 'assessment' as const,
      date: r.assessment.date,
      title: r.assessment.title,
      category: r.assessment.category.name,
      score: r.score,
      maxScore: r.assessment.maxScore,
    })),
    ...quizAttempts.map((a) => ({
      id: a.id,
      kind: 'quiz' as const,
      date: a.quiz.lessonSession.date,
      title: a.quiz.title,
      category: 'Test',
      score: a.correctCount ?? 0,
      maxScore: a.quiz._count.questions,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime())
}

/** The active group's upcoming lesson moves, shaped for the Mini App. */
async function scheduleChanges(enrollment: Awaited<ReturnType<typeof activeEnrollment>>) {
  if (!enrollment) return []
  const reschedules = await upcomingReschedules(enrollment.groupId)
  return reschedules.map((r) => ({
    id: r.id,
    originalDate: r.originalDate,
    regularTime: enrollment.group.scheduleTime,
    newDate: r.newDate,
    newTime: r.newTime,
    reason: r.reason,
  }))
}

/**
 * Everyone in the active group, placed by the points they earned in it. Classmates
 * appear by first name and last initial only, and no ids leave the server -- the
 * student's own row is flagged `isMe` instead.
 */
async function groupRanking(enrollment: Awaited<ReturnType<typeof activeEnrollment>>, studentId: string) {
  if (!enrollment) return null
  const leaderboard = await getGroupLeaderboard(enrollment.groupId)
  const rows = placesByPoints(
    // Classmates tied on points are listed alphabetically.
    leaderboard.map(({ student, points }) => ({
      name: `${student.firstName} ${student.lastName.charAt(0)}.`.trim(),
      points,
      isMe: student.id === studentId,
    })).sort((a, b) => a.name.localeCompare(b.name)),
  )
  const mine = rows.find((row) => row.isMe)
  return { myPlace: mine?.place ?? null, myPoints: mine?.points ?? 0, rows }
}
