import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, deleteSubject, renameSubject } from '@tashkurgan/domain'

const createSchema = z.object({ name: z.string().min(1) })
const idParamsSchema = z.object({ id: z.string() })

export const subjectRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'subject', action: 'manage' })
    const body = createSchema.parse(request.body)
    return prisma.subject.create({ data: body })
  })

  app.patch('/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'subject', action: 'manage' })
    const { id } = idParamsSchema.parse(request.params)
    const body = createSchema.parse(request.body)
    return renameSubject(id, body.name)
  })

  app.delete('/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'subject', action: 'manage' })
    const { id } = idParamsSchema.parse(request.params)
    await deleteSubject(id)
    return { ok: true }
  })

  app.get('/',{ preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'subject', action: 'view' })
    return prisma.subject.findMany({ include: { courses: true } })
  })
}
