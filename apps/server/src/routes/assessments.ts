import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, recordAssessmentResults } from '@tashkurgan/domain'
import { NotFoundError } from '@tashkurgan/shared'

const levelIdParams = z.object({ levelId: z.string() })
const categoryIdParams = z.object({ id: z.string() })
const groupIdParams = z.object({ groupId: z.string() })
const assessmentIdParams = z.object({ id: z.string() })

const createCategorySchema = z.object({ name: z.string().min(1) })

const resultInputSchema = z.object({ studentId: z.string(), score: z.number().min(0) })

const createAssessmentSchema = z.object({
  categoryId: z.string(),
  title: z.string().min(1),
  type: z.enum(['WEEKLY', 'MONTHLY', 'GENERAL', 'CUSTOM']),
  date: z.coerce.date(),
  maxScore: z.number().int().positive(),
  teacherComment: z.string().optional(),
  results: z.array(resultInputSchema).optional(),
})

const resultsSchema = z.object({ results: z.array(resultInputSchema) })
const rangeQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })

async function requireGroup(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } })
  if (!group) throw new NotFoundError('Group not found')
  return group
}

export const assessmentRoutes: FastifyPluginAsync = async (app) => {
  // AssessmentCategory belongs to Level's aggregate -- Admin-managed like
  // Subject/Course/Level; a Teacher may only view what's configured.
  app.post(
    '/levels/:levelId/assessment-categories',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.actor!, { resource: 'assessmentCategory', action: 'manage' })
      const { levelId } = levelIdParams.parse(request.params)
      const body = createCategorySchema.parse(request.body)
      return prisma.assessmentCategory.create({ data: { levelId, name: body.name } })
    },
  )

  app.get(
    '/levels/:levelId/assessment-categories',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.actor!, { resource: 'assessmentCategory', action: 'view' })
      const { levelId } = levelIdParams.parse(request.params)
      return prisma.assessmentCategory.findMany({ where: { levelId, retiredAt: null } })
    },
  )

  // Retiring, never deleting, so historical Assessments keep referencing the
  // category as it was configured at creation time (§51.2).
  app.patch(
    '/assessment-categories/:id/retire',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.actor!, { resource: 'assessmentCategory', action: 'manage' })
      const { id } = categoryIdParams.parse(request.params)
      return prisma.assessmentCategory.update({ where: { id }, data: { retiredAt: new Date() } })
    },
  )

  // One call creates the assessment and (optionally) its whole group's
  // results together -- the §19 "Ali: 85, Madina: 92..." pattern.
  app.post('/groups/:groupId/assessments', { preHandler: app.authenticate }, async (request) => {
    const { groupId } = groupIdParams.parse(request.params)
    const group = await requireGroup(groupId)
    assertCan(request.actor!, { resource: 'assessment', action: 'manage', ownerTeacherId: group.teacherId })

    const body = createAssessmentSchema.parse(request.body)
    const assessment = await prisma.assessment.create({
      data: {
        groupId,
        categoryId: body.categoryId,
        title: body.title,
        type: body.type,
        date: body.date,
        maxScore: body.maxScore,
        teacherComment: body.teacherComment,
      },
    })

    if (body.results?.length) {
      await recordAssessmentResults(assessment.id, body.results)
    }

    return prisma.assessment.findUniqueOrThrow({
      where: { id: assessment.id },
      include: { results: true, category: true },
    })
  })

  app.get('/groups/:groupId/assessments', { preHandler: app.authenticate }, async (request) => {
    const { groupId } = groupIdParams.parse(request.params)
    const group = await requireGroup(groupId)
    assertCan(request.actor!, { resource: 'assessment', action: 'view', ownerTeacherId: group.teacherId })

    const { from, to } = rangeQuery.parse(request.query)
    return prisma.assessment.findMany({
      where: {
        groupId,
        ...(from || to
          ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: { category: true, results: true },
      orderBy: { date: 'desc' },
    })
  })

  app.post('/assessments/:id/results', { preHandler: app.authenticate }, async (request) => {
    const { id } = assessmentIdParams.parse(request.params)
    const assessment = await prisma.assessment.findUnique({ where: { id }, include: { group: true } })
    if (!assessment) throw new NotFoundError('Assessment not found')

    assertCan(request.actor!, {
      resource: 'assessment',
      action: 'manage',
      ownerTeacherId: assessment.group.teacherId,
    })
    const body = resultsSchema.parse(request.body)
    return recordAssessmentResults(id, body.results)
  })
}
