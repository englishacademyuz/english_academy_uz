import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, createLevel, deleteLevel, renameLevel } from '@tashkurgan/domain'

const paramsSchema = z.object({ courseId: z.string() })
const idParamsSchema = z.object({ id: z.string() })
const createSchema = z.object({ name: z.string().min(1) })
const querySchema = z.object({ courseId: z.string().optional() })

export const levelRoutes: FastifyPluginAsync = async (app) => {
  app.post('/courses/:courseId/levels', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'level', action: 'manage' })
    const { courseId } = paramsSchema.parse(request.params)
    const body = createSchema.parse(request.body)
    return createLevel(courseId, body.name)
  })

  app.patch('/levels/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'level', action: 'manage' })
    const { id } = idParamsSchema.parse(request.params)
    const body = createSchema.parse(request.body)
    return renameLevel(id, body.name)
  })

  app.delete('/levels/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'level', action: 'manage' })
    const { id } = idParamsSchema.parse(request.params)
    await deleteLevel(id)
    return { ok: true }
  })

  app.get('/levels',{ preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'level', action: 'view' })
    const { courseId } = querySchema.parse(request.query)
    return prisma.level.findMany({ where: courseId ? { courseId } : undefined })
  })
}
