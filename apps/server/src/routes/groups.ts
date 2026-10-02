import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { archiveGroup, assertCan, enrollStudent, endEnrollment, changeGroup } from '@tashkurgan/domain'
import { ConflictError, NotFoundError } from '@tashkurgan/shared'

const createSchema = z.object({
  levelId: z.string(),
  teacherId: z.string(),
  name: z.string().min(1),
  scheduleDays: z.array(z.string()).min(1),
  scheduleTime: z.string().min(1),
  startDate: z.coerce.date(),
  monthlyFee: z.number().int().min(0).optional(),
  homeworkSubmissionEnabled: z.boolean().optional(),
})
const updateSchema = createSchema.partial()

const idParamsSchema = z.object({ id: z.string() })
const enrollmentIdParamsSchema = z.object({ enrollmentId: z.string() })

const enrollSchema = z.object({ studentId: z.string(), startDate: z.coerce.date() })
const endSchema = z.object({
  endDate: z.coerce.date(),
  endReason: z.enum(['GROUP_CHANGE', 'STUDENT_LEFT', 'COMPLETED', 'OTHER']),
})
const changeGroupSchema = z.object({ toGroupId: z.string(), changeDate: z.coerce.date() })

async function requireGroup(id: string) {
  const group = await prisma.group.findUnique({ where: { id } })
  if (!group) throw new NotFoundError('Group not found')
  return group
}

async function requireEnrollmentWithGroup(enrollmentId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { group: true },
  })
  if (!enrollment) throw new NotFoundError('Enrollment not found')
  return enrollment
}

async function subjectIdOfLevel(levelId: string) {
  const level = await prisma.level.findUnique({ where: { id: levelId }, include: { course: true } })
  if (!level) throw new NotFoundError('Level not found')
  return level.course.subjectId
}

export const groupRoutes: FastifyPluginAsync = async (app) => {
  app.post('/groups', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'group', action: 'manage' })
    const body = createSchema.parse(request.body)
    return prisma.group.create({ data: body })
  })

  // Fixes a group created with the wrong details. Enrollments carry their
  // group's subject, so a group with students can't move to another subject.
  app.patch('/groups/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'group', action: 'manage' })
    const { id } = idParamsSchema.parse(request.params)
    const group = await requireGroup(id)
    if (group.archivedAt) throw new ConflictError('This group has been deleted')
    const body = updateSchema.parse(request.body)

    if (body.levelId && body.levelId !== group.levelId) {
      const [from, to] = await Promise.all([subjectIdOfLevel(group.levelId), subjectIdOfLevel(body.levelId)])
      const hasStudents = await prisma.enrollment.count({ where: { groupId: id, status: 'ACTIVE' } })
      if (from !== to && hasStudents > 0) {
        throw new ConflictError('A group with students cannot move to a level of another subject')
      }
    }
    return prisma.group.update({ where: { id }, data: body })
  })

  // Archives rather than deletes -- see archiveGroup.
  app.delete('/groups/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'group', action: 'manage' })
    const { id } = idParamsSchema.parse(request.params)
    await archiveGroup(id)
    return { ok: true }
  })

  app.get('/groups', { preHandler: app.authenticate }, async (request) => {
    const actor = request.actor!
    return prisma.group.findMany({
      where: { archivedAt: null, ...(actor.role === 'TEACHER' ? { teacherId: actor.teacherId } : {}) },
      include: { level: true, teacher: true, enrollments: { where: { status: 'ACTIVE' } } },
      orderBy: { createdAt: 'asc' },
    })
  })

  app.get('/groups/:id', { preHandler: app.authenticate }, async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        level: true,
        teacher: true,
        enrollments: { where: { status: 'ACTIVE' }, include: { student: true }, orderBy: { startDate: 'asc' } },
      },
    })
    if (!group) throw new NotFoundError('Group not found')

    assertCan(request.actor!, { resource: 'group', action: 'view', ownerTeacherId: group.teacherId })
    return group
  })

  app.post('/groups/:id/enrollments', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'enrollment', action: 'manage' })
    const { id } = idParamsSchema.parse(request.params)
    await requireGroup(id)
    const body = enrollSchema.parse(request.body)
    return enrollStudent(body.studentId, id, body.startDate)
  })

  app.patch('/enrollments/:enrollmentId/end', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'enrollment', action: 'manage' })
    const { enrollmentId } = enrollmentIdParamsSchema.parse(request.params)
    await requireEnrollmentWithGroup(enrollmentId)
    const body = endSchema.parse(request.body)
    return endEnrollment(enrollmentId, body.endDate, body.endReason)
  })

  app.patch('/enrollments/:enrollmentId/change-group', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'enrollment', action: 'manage' })
    const { enrollmentId } = enrollmentIdParamsSchema.parse(request.params)
    await requireEnrollmentWithGroup(enrollmentId)
    const body = changeGroupSchema.parse(request.body)
    return changeGroup(enrollmentId, body.toGroupId, body.changeDate)
  })
}
