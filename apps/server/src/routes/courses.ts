import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, deleteCourse, renameCourse } from '@tashkurgan/domain'

const paramsSchema = z.object({ subjectId: z.string() })
const idParamsSchema = z.object({ id: z.string() })
const createSchema = z.object({ name: z.string().min(1) })
const querySchema = z.object({ subjectId: z.string().optional() })

export const courseRoutes: FastifyPluginAsync = async (app) => {
  app.post('/subjects/:subjectId/courses', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'course', action: 'manage' })
    const { subjectId } = paramsSchema.parse(request.params)
    const body = createSchema.parse(request.body)
    return prisma.course.create({ data: { ...body, subjectId } })
  })

  app.patch('/courses/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'course', action: 'manage' })
    const { id } = idParamsSchema.parse(request.params)
    const body = createSchema.parse(request.body)
    return renameCourse(id, body.name)
  })

  app.delete('/courses/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'course', action: 'manage' })
    const { id } = idParamsSchema.parse(request.params)
    await deleteCourse(id)
    return { ok: true }
  })

  app.get('/courses',{ preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'course', action: 'view' })
    const { subjectId } = querySchema.parse(request.query)
    return prisma.course.findMany({
      where: subjectId ? { subjectId } : undefined,
      include: { levels: true },
    })
  })
}
