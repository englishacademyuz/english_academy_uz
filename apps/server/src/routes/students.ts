import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, issueLinkingCode } from '@tashkurgan/domain'
import { NotFoundError } from '@tashkurgan/shared'

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dob: z.coerce.date(),
  phone: z.string().optional(),
})

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'INACTIVE', 'COMPLETED', 'LEFT']).optional(),
})

const querySchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'INACTIVE', 'COMPLETED', 'LEFT']).optional(),
})

const paramsSchema = z.object({ id: z.string() })

export const studentRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'manage' })
    const body = createSchema.parse(request.body)
    return prisma.student.create({ data: body })
  })

  app.get('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'view' })
    const { status } = querySchema.parse(request.query)
    return prisma.student.findMany({ where: status ? { status } : undefined })
  })

  app.get('/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'view' })
    const { id } = paramsSchema.parse(request.params)
    const student = await prisma.student.findUnique({
      where: { id },
      include: { enrollments: true, parentLinks: { where: { unlinkedAt: null } } },
    })
    if (!student) throw new NotFoundError('Student not found')
    return student
  })

  app.patch('/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'manage' })
    const { id } = paramsSchema.parse(request.params)
    const body = updateSchema.parse(request.body)
    return prisma.student.update({ where: { id }, data: body })
  })

  app.post('/:id/linking-code', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'linkingCode', action: 'issue' })
    const { id } = paramsSchema.parse(request.params)
    return issueLinkingCode('STUDENT', id)
  })
}
