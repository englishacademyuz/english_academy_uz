import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan } from '@tashkurgan/domain'

const paramsSchema = z.object({ courseId: z.string() })
const createSchema = z.object({ name: z.string().min(1) })
const querySchema = z.object({ courseId: z.string().optional() })

export const levelRoutes: FastifyPluginAsync = async (app) => {
  app.post('/courses/:courseId/levels', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'level', action: 'manage' })
    const { courseId } = paramsSchema.parse(request.params)
    const body = createSchema.parse(request.body)
    return prisma.level.create({ data: { ...body, courseId } })
  })

  app.get('/levels', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'level', action: 'view' })
    const { courseId } = querySchema.parse(request.query)
    return prisma.level.findMany({ where: courseId ? { courseId } : undefined })
  })
}
