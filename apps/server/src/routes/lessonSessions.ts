import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, recordLessonSession, recordHomeworkResults } from '@tashkurgan/domain'
import { NotFoundError } from '@tashkurgan/shared'

const materialSchema = z.object({
  type: z.enum(['PDF', 'DOCUMENT', 'IMAGE', 'VIDEO', 'AUDIO', 'LINK', 'TEXT']),
  content: z.string().min(1),
})

const recordSessionSchema = z.object({
  date: z.coerce.date(),
  topic: z.string().optional(),
  notes: z.string().optional(),
  materials: z.array(materialSchema).optional(),
  homework: z
    .object({ instructions: z.string().min(1), dueDate: z.coerce.date().optional() })
    .optional(),
  attendance: z
    .array(z.object({ studentId: z.string(), status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']) }))
    .optional(),
})

const homeworkResultsSchema = z.object({
  results: z.array(
    z.object({
      studentId: z.string(),
      status: z.enum(['COMPLETED', 'NOT_COMPLETED']),
      score: z.number().min(0).max(100).nullable().optional(),
      teacherComment: z.string().optional(),
    }),
  ),
})

const groupIdParams = z.object({ groupId: z.string() })
const sessionIdParams = z.object({ id: z.string() })
// `date` picks one exact day; `from`/`to` pick a range (e.g. one calendar month) --
// callers use whichever shape fits, never both at once.
const dateQuery = z.object({
  date: z.coerce.date().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

async function requireGroup(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } })
  if (!group) throw new NotFoundError('Group not found')
  return group
}

export const lessonSessionRoutes: FastifyPluginAsync = async (app) => {
  // The one coarse-grained "save the lesson" call (topic + materials +
  // homework + attendance together) -- requirements §29, ARCHITECTURE.md §4.
  app.post('/groups/:groupId/sessions', { preHandler: app.authenticate }, async (request) => {
    const { groupId } = groupIdParams.parse(request.params)
    const group = await requireGroup(groupId)
    assertCan(request.actor!, {
      resource: 'lessonSession',
      action: 'manage',
      ownerTeacherId: group.teacherId,
    })

    const body = recordSessionSchema.parse(request.body)
    return recordLessonSession({
      groupId,
      teacherId: group.teacherId,
      date: body.date,
      topic: body.topic,
      notes: body.notes,
      materials: body.materials,
      homework: body.homework,
      attendance: body.attendance,
    })
  })

  app.get('/groups/:groupId/sessions', { preHandler: app.authenticate }, async (request) => {
    const { groupId } = groupIdParams.parse(request.params)
    const group = await requireGroup(groupId)
    assertCan(request.actor!, {
      resource: 'lessonSession',
      action: 'view',
      ownerTeacherId: group.teacherId,
    })

    const { date, from, to } = dateQuery.parse(request.query)
    return prisma.lessonSession.findMany({
      where: {
        groupId,
        ...(date
          ? { date }
          : from || to
            ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
            : {}),
      },
      include: { materials: true, homework: true, attendances: true },
      orderBy: { date: 'desc' },
    })
  })

  app.get('/sessions/:id', { preHandler: app.authenticate }, async (request) => {
    const { id } = sessionIdParams.parse(request.params)
    const session = await prisma.lessonSession.findUnique({
      where: { id },
      include: { materials: true, homework: true, attendances: true, group: true },
    })
    if (!session) throw new NotFoundError('Session not found')

    assertCan(request.actor!, {
      resource: 'lessonSession',
      action: 'view',
      ownerTeacherId: session.group.teacherId,
    })
    return session
  })

  // Recording checked homework typically happens in a later session, so
  // this is its own call rather than part of `recordLessonSession`.
  app.post('/sessions/:id/homework-results', { preHandler: app.authenticate }, async (request) => {
    const { id } = sessionIdParams.parse(request.params)
    const session = await prisma.lessonSession.findUnique({
      where: { id },
      include: { group: true, homework: true },
    })
    if (!session) throw new NotFoundError('Session not found')
    if (!session.homework) throw new NotFoundError('This session has no homework to grade')

    assertCan(request.actor!, {
      resource: 'homeworkResult',
      action: 'manage',
      ownerTeacherId: session.group.teacherId,
    })

    const body = homeworkResultsSchema.parse(request.body)
    return recordHomeworkResults(session.homework.id, body.results)
  })
}
