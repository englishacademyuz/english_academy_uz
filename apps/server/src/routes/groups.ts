import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, enrollStudent, endEnrollment, changeGroup } from '@tashkurgan/domain'
import { NotFoundError } from '@tashkurgan/shared'

const createSchema = z.object({
  levelId: z.string(),
  teacherId: z.string(),
  name: z.string().min(1),
  scheduleDays: z.array(z.string()).min(1),
  scheduleTime: z.string().min(1),
  startDate: z.coerce.date(),
})

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

export const groupRoutes: FastifyPluginAsync = async (app) => {
  app.post('/groups', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'group', action: 'manage' })
    const body = createSchema.parse(request.body)
    return prisma.group.create({ data: body })
  })

  app.get('/groups', { preHandler: app.authenticate }, async (request) => {
    const actor = request.actor!
    const where = actor.role === 'TEACHER' ? { teacherId: actor.teacherId } : undefined
    return prisma.group.findMany({ where, include: { level: true, teacher: true } })
  })

  app.get('/groups/:id', { preHandler: app.authenticate }, async (request) => {
    const { id } = idParamsSchema.parse(request.params)
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        level: true,
        teacher: true,
        enrollments: { where: { status: 'ACTIVE' }, include: { student: true } },
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
