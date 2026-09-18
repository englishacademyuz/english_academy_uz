import { prisma } from '@tashkurgan/db'
import { NotFoundError, ValidationError } from '@tashkurgan/shared'
import { calculateAttendanceRate } from '../attendance/attendance'
import { calculateHomeworkRate } from '../homework/homework'
import { toPercentage } from '../assessment/assessment'
import { sumPoints } from '../points/points'

/**
 * 'sinceEnrollment' and 'course' both require a groupId to resolve a date
 * range from -- 'sinceEnrollment' uses that specific enrollment's own
 * start/end; 'course' spans every enrollment the student has ever held in
 * the same course (across group changes), from the earliest one to now.
 */
export type Timeframe =
  | { kind: 'today' | 'week' | 'month' }
  | { kind: 'sinceEnrollment' | 'course' }
  | { kind: 'custom'; start: Date; end: Date }

export type ProgressSnapshot = {
  timeframe: Timeframe
  attendanceRate: number | null
  homeworkRate: number | null
  /** Not yet populated -- there is no quiz module yet (docs/DOMAIN-MODEL.md §10). */
  quizAverage: number | null
  academicByCategory: Record<string, number>
  /** Sum of PointTransaction entries earned in this timeframe (and group, when scoped) -- §51.3. */
  points: number
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const daysSinceMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - daysSinceMonday)
  return d
}

async function resolveDateRange(
  studentId: string,
  timeframe: Timeframe,
  groupId?: string,
): Promise<{ start: Date; end: Date }> {
  const now = new Date()

  switch (timeframe.kind) {
    case 'today':
      return { start: startOfDay(now), end: now }
    case 'week':
      return { start: startOfWeek(now), end: now }
    case 'month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }
    case 'custom':
      if (timeframe.start > timeframe.end) throw new ValidationError('start must be before end')
      return { start: timeframe.start, end: timeframe.end }
    case 'sinceEnrollment': {
      if (!groupId) throw new ValidationError('groupId is required for the sinceEnrollment timeframe')
      const enrollment = await prisma.enrollment.findFirst({
        where: { studentId, groupId },
        orderBy: { startDate: 'desc' },
      })
      if (!enrollment) throw new NotFoundError('No enrollment found for this student in this group')
      return { start: enrollment.startDate, end: enrollment.endDate ?? now }
    }
    case 'course': {
      if (!groupId) throw new ValidationError('groupId is required for the course timeframe')
      const group = await prisma.group.findUnique({ where: { id: groupId }, include: { level: true } })
      if (!group) throw new NotFoundError('Group not found')

      const enrollments = await prisma.enrollment.findMany({
        where: { studentId, group: { level: { courseId: group.level.courseId } } },
        orderBy: { startDate: 'asc' },
      })
      if (enrollments.length === 0) throw new NotFoundError('No enrollment found for this student in this course')
      return { start: enrollments[0].startDate, end: now }
    }
  }
}

/**
 * The one deep module that composes attendance/homework/assessment history
 * into a single snapshot for a student over a timeframe -- never persisted
 * (docs/ARCHITECTURE.md §9). The same function serves the student's own
 * profile, a parent's view of their child, and a teacher's group-scoped
 * statistics; `groupId` narrows the underlying queries when provided.
 */
export async function getProgress(
  studentId: string,
  timeframe: Timeframe,
  groupId?: string,
): Promise<ProgressSnapshot> {
  const student = await prisma.student.findUnique({ where: { id: studentId } })
  if (!student) throw new NotFoundError('Student not found')

  const { start, end } = await resolveDateRange(studentId, timeframe, groupId)
  const dateFilter = { gte: start, lte: end }

  const attendances = await prisma.attendance.findMany({
    where: { studentId, lessonSession: { date: dateFilter, ...(groupId ? { groupId } : {}) } },
    select: { status: true },
  })
  const attendanceRate = calculateAttendanceRate(attendances.map((a) => a.status))

  const homeworkResults = await prisma.homeworkResult.findMany({
    where: {
      studentId,
      homework: { lessonSession: { date: dateFilter, ...(groupId ? { groupId } : {}) } },
    },
    select: { score: true },
  })
  const homeworkRate = calculateHomeworkRate(homeworkResults.map((r) => r.score))

  const assessmentResults = await prisma.assessmentResult.findMany({
    where: { studentId, assessment: { date: dateFilter, ...(groupId ? { groupId } : {}) } },
    include: { assessment: { include: { category: true } } },
  })

  const byCategory = new Map<string, { total: number; count: number }>()
  for (const result of assessmentResults) {
    const name = result.assessment.category.name
    const entry = byCategory.get(name) ?? { total: 0, count: 0 }
    entry.total += toPercentage(result.score, result.assessment.maxScore)
    entry.count += 1
    byCategory.set(name, entry)
  }
  const academicByCategory: Record<string, number> = {}
  for (const [name, { total, count }] of byCategory) {
    academicByCategory[name] = total / count
  }

  const pointTransactions = await prisma.pointTransaction.findMany({
    where: { studentId, createdAt: dateFilter, ...(groupId ? { groupId } : {}) },
    select: { points: true },
  })

  return {
    timeframe,
    attendanceRate,
    homeworkRate,
    quizAverage: null,
    academicByCategory,
    points: sumPoints(pointTransactions),
  }
}
