import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, getProgress, type Timeframe } from '@tashkurgan/domain'
import { NotFoundError, ValidationError } from '@tashkurgan/shared'

const paramsSchema = z.object({ id: z.string() })
const querySchema = z.object({
  kind: z.enum(['today', 'week', 'month', 'sinceEnrollment', 'course', 'custom']),
  groupId: z.string().optional(),
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
})

export const progressRoutes: FastifyPluginAsync = async (app) => {
  app.get('/students/:id/progress', { preHandler: app.authenticate }, async (request) => {
    const { id } = paramsSchema.parse(request.params)
    const query = querySchema.parse(request.query)

    let ownerTeacherId: string | undefined
    if (query.groupId) {
      const group = await prisma.group.findUnique({ where: { id: query.groupId } })
      if (!group) throw new NotFoundError('Group not found')
      ownerTeacherId = group.teacherId
    }
    assertCan(request.actor!, { resource: 'progress', action: 'view', ownerTeacherId })

    let timeframe: Timeframe
    if (query.kind === 'custom') {
      if (!query.start || !query.end) throw new ValidationError('start and end are required for a custom timeframe')
      timeframe = { kind: 'custom', start: query.start, end: query.end }
    } else {
      timeframe = { kind: query.kind }
    }

    return getProgress(id, timeframe, query.groupId)
  })
}
