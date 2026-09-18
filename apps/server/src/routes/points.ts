import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, awardPoints, getGroupLeaderboard, sumPoints } from '@tashkurgan/domain'
import { NotFoundError } from '@tashkurgan/shared'

const studentParams = z.object({ id: z.string() })
const groupParams = z.object({ groupId: z.string() })

const awardSchema = z.object({
  studentId: z.string(),
  activityType: z.enum(['HOMEWORK', 'PARTICIPATION', 'QUIZ', 'ASSESSMENT', 'ATTENDANCE', 'OTHER']),
  points: z.number().int(),
  note: z.string().optional(),
})

const leaderboardQuery = z.object({ start: z.coerce.date().optional(), end: z.coerce.date().optional() })

async function requireGroup(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } })
  if (!group) throw new NotFoundError('Group not found')
  return group
}

export const pointRoutes: FastifyPluginAsync = async (app) => {
  app.get('/students/:id/points', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'pointTransaction', action: 'view' })
    const { id } = studentParams.parse(request.params)

    const transactions = await prisma.pointTransaction.findMany({
      where: { studentId: id },
      include: { group: true },
      orderBy: { createdAt: 'desc' },
    })
    return { transactions, total: sumPoints(transactions) }
  })

  // Tagged with the Group active when earned (§51.3) -- a Teacher may only
  // award points within one of their own groups.
  app.post('/groups/:groupId/points', { preHandler: app.authenticate }, async (request) => {
    const { groupId } = groupParams.parse(request.params)
    const group = await requireGroup(groupId)
    assertCan(request.actor!, { resource: 'pointTransaction', action: 'manage', ownerTeacherId: group.teacherId })

    const body = awardSchema.parse(request.body)
    return awardPoints({ ...body, groupId })
  })

  app.get('/groups/:groupId/leaderboard', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'pointTransaction', action: 'view' })
    const { groupId } = groupParams.parse(request.params)
    await requireGroup(groupId)

    const { start, end } = leaderboardQuery.parse(request.query)
    return getGroupLeaderboard(groupId, start && end ? { start, end } : undefined)
  })
}
