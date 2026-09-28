import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma, type AttendanceStatus } from '@tashkurgan/db'
import {
  answerQuizQuestion,
  calculateAttendanceRate,
  getProgress,
  listQuizzesForStudent,
  startQuizAttempt,
  sumPoints,
} from '@tashkurgan/domain'
import { NotFoundError } from '@tashkurgan/shared'

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
    teacher: group.teacher.fullName,
    scheduleDays: group.scheduleDays,
    scheduleTime: group.scheduleTime,
  }
}

/** Groups (current or past) the student was enrolled in -- what "their" lessons are drawn from. */
async function enrolledGroupIds(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({ where: { studentId }, select: { groupId: true } })
  return [...new Set(enrollments.map((e) => e.groupId))]
}

export const miniAppRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticateStudent)

  // Bosh sahifa: everything the home screen needs in one call.
  app.get('/student/home', async (request) => {
    const student = me(request)
    const enrollment = await activeEnrollment(student.id)
    const now = new Date()

    const [lastLesson, latestHomework, quizzes, progress, points] = await Promise.all([
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
            select: { id: true, date: true, topic: true, homework: { select: { instructions: true, dueDate: true } } },
          })
        : null,
      listQuizzesForStudent(student.id, now),
      getProgress(student.id, { kind: 'month' }),
      prisma.pointTransaction.findMany({ where: { studentId: student.id }, select: { points: true } }),
    ])

    return {
      student: { firstName: student.firstName, lastName: student.lastName },
      group: groupSummary(enrollment),
      lastLesson,
      latestHomework: latestHomework?.homework
        ? { lessonId: latestHomework.id, date: latestHomework.date, topic: latestHomework.topic, ...latestHomework.homework }
        : null,
      openQuizzes: quizzes.filter((q) => q.isOpen && !q.attempt?.completed),
      monthProgress: progress,
      totalPoints: sumPoints(points),
    }
  })

  app.get('/student/lessons', async (request) => {
    const student = me(request)
    const { page } = pageQuery.parse(request.query)
    const enrollment = await activeEnrollment(student.id)
    if (!enrollment) return { group: null, lessons: [], hasMore: false }

    const where = { groupId: enrollment.groupId, date: { lte: new Date() } }
    const [lessons, total] = await Promise.all([
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
    ])
    return {
      group: groupSummary(enrollment),
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
      include: { materials: true, homework: true, group: { select: { name: true } } },
    })
    // Same answer for "doesn't exist" and "not yours" -- nothing to probe.
    if (!lesson) throw new NotFoundError('Lesson not found')
    return {
      id: lesson.id,
      date: lesson.date,
      topic: lesson.topic,
      group: lesson.group.name,
      materials: lesson.materials.map((m) => ({ id: m.id, type: m.type, content: m.content })),
      homework: lesson.homework ? { instructions: lesson.homework.instructions, dueDate: lesson.homework.dueDate } : null,
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
      select: { id: true, date: true, topic: true, homework: { select: { instructions: true, dueDate: true } } },
    })
    return lessons.map((l) => ({ lessonId: l.id, date: l.date, topic: l.topic, ...l.homework! }))
  })

  app.get('/student/progress', async (request) => {
    const student = me(request)
    const { kind } = progressQuery.parse(request.query)
    const snapshot = await getProgress(student.id, { kind })
    const { start, end } = snapshotRange(kind)

    const [assessmentResults, quizAttempts] = await Promise.all([
      prisma.assessmentResult.findMany({
        where: { studentId: student.id, assessment: { date: { gte: start, lte: end } } },
        include: { assessment: { include: { category: true } } },
        orderBy: { assessment: { date: 'desc' } },
      }),
      prisma.quizAttempt.findMany({
        where: { studentId: student.id, completedAt: { not: null }, quiz: { lessonSession: { date: { gte: start, lte: end } } } },
        include: { quiz: { include: { lessonSession: true, _count: { select: { questions: true } } } } },
      }),
    ])

    const marks = [
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
    const [lessons, records] = await Promise.all([
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
    }
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
