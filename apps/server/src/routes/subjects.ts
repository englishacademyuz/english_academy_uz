import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan } from '@tashkurgan/domain'

const createSchema = z.object({ name: z.string().min(1) })

export const subjectRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'subject', action: 'manage' })
    const body = createSchema.parse(request.body)
    return prisma.subject.create({ data: body })
  })

  app.get('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'subject', action: 'view' })
    return prisma.subject.findMany({ include: { courses: true } })
  })
}
