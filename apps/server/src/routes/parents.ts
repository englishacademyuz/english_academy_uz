import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, issueLinkingCode } from '@tashkurgan/domain'

const createSchema = z.object({ fullName: z.string().min(1), phone: z.string().optional() })
const linkSchema = z.object({ studentId: z.string() })
const paramsSchema = z.object({ id: z.string() })
const linkParamsSchema = z.object({ linkId: z.string() })

export const parentRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'parent', action: 'manage' })
    const body = createSchema.parse(request.body)
    return prisma.parent.create({ data: body })
  })

  app.get('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'parent', action: 'view' })
    return prisma.parent.findMany()
  })

  app.post('/:id/linking-code', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'linkingCode', action: 'issue' })
    const { id } = paramsSchema.parse(request.params)
    return issueLinkingCode('PARENT', id)
  })

  // The family relationship -- created directly by an admin, independent of
  // whether either side has linked a Telegram account yet (see CONTEXT.md).
  app.post('/:id/links', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'parentStudentLink', action: 'manage' })
    const { id } = paramsSchema.parse(request.params)
    const body = linkSchema.parse(request.body)
    return prisma.parentStudentLink.create({ data: { parentId: id, studentId: body.studentId } })
  })

  app.patch('/links/:linkId/revoke', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'parentStudentLink', action: 'manage' })
    const { linkId } = linkParamsSchema.parse(request.params)
    return prisma.parentStudentLink.update({
      where: { id: linkId },
      data: { unlinkedAt: new Date() },
    })
  })
}
