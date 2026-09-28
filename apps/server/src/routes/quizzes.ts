import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import {
  assertCan,
  closeQuiz,
  createQuiz,
  deleteQuizDraft,
  getQuizWithResults,
  listGroupQuizzes,
  sendQuiz,
  updateQuizDraft,
} from '@tashkurgan/domain'
import { NotFoundError } from '@tashkurgan/shared'

export type QuizAnnouncement = {
  quizId: string
  title: string
  questionCount: number
  maxPoints: number
  deadline: Date
}

/** Delivers "a new quiz is open" to Telegram chats -- the bot in production, a no-op or spy in tests. */
export type QuizNotifier = (chatIds: string[], quiz: QuizAnnouncement) => Promise<void>

const quizSchema = z.object({
  title: z.string().min(1),
  maxPoints: z.number().int().min(0),
  questions: z
    .array(
      z.object({
        text: z.string().min(1),
        options: z.array(z.object({ text: z.string().min(1), isCorrect: z.boolean() })).min(2).max(6),
      }),
    )
    .min(1),
})

const createSchema = quizSchema.extend({ date: z.coerce.date() })
const sendSchema = z.object({ deadline: z.coerce.date() })
const groupIdParams = z.object({ groupId: z.string() })
const quizIdParams = z.object({ id: z.string() })
const rangeQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })

async function requireGroup(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } })
  if (!group) throw new NotFoundError('Group not found')
  return group
}

async function requireQuizGroup(quizId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { lessonSession: { include: { group: true } } },
  })
  if (!quiz) throw new NotFoundError('Quiz not found')
  return quiz.lessonSession.group
}

export const quizRoutes: FastifyPluginAsync<{ notifier?: QuizNotifier }> = async (app, opts) => {
  const notify: QuizNotifier = opts.notifier ?? (async () => {})

  app.get('/groups/:groupId/quizzes', { preHandler: app.authenticate }, async (request) => {
    const { groupId } = groupIdParams.parse(request.params)
    const group = await requireGroup(groupId)
    assertCan(request.actor!, { resource: 'quiz', action: 'view', ownerTeacherId: group.teacherId })
    return listGroupQuizzes(groupId, rangeQuery.parse(request.query))
  })

  app.post('/groups/:groupId/quizzes', { preHandler: app.authenticate }, async (request) => {
    const { groupId } = groupIdParams.parse(request.params)
    const group = await requireGroup(groupId)
    assertCan(request.actor!, { resource: 'quiz', action: 'manage', ownerTeacherId: group.teacherId })
    const { date, ...input } = createSchema.parse(request.body)
    return createQuiz(groupId, group.teacherId, date, input)
  })

  app.get('/quizzes/:id', { preHandler: app.authenticate }, async (request) => {
    const { id } = quizIdParams.parse(request.params)
    const group = await requireQuizGroup(id)
    assertCan(request.actor!, { resource: 'quiz', action: 'view', ownerTeacherId: group.teacherId })
    return getQuizWithResults(id)
  })

  app.put('/quizzes/:id', { preHandler: app.authenticate }, async (request) => {
    const { id } = quizIdParams.parse(request.params)
    const group = await requireQuizGroup(id)
    assertCan(request.actor!, { resource: 'quiz', action: 'manage', ownerTeacherId: group.teacherId })
    return updateQuizDraft(id, quizSchema.parse(request.body))
  })

  app.delete('/quizzes/:id', { preHandler: app.authenticate }, async (request) => {
    const { id } = quizIdParams.parse(request.params)
    const group = await requireQuizGroup(id)
    assertCan(request.actor!, { resource: 'quiz', action: 'manage', ownerTeacherId: group.teacherId })
    await deleteQuizDraft(id)
    return { ok: true }
  })

  app.post('/quizzes/:id/send', { preHandler: app.authenticate }, async (request) => {
    const { id } = quizIdParams.parse(request.params)
    const group = await requireQuizGroup(id)
    assertCan(request.actor!, { resource: 'quiz', action: 'manage', ownerTeacherId: group.teacherId })
    const { deadline } = sendSchema.parse(request.body)

    const { quiz, chatIds } = await sendQuiz(id, deadline)
    // Delivery runs in the background: the quiz is already open (and listed in
    // the bot's quiz menu), so a slow or failed Telegram call mustn't fail the send.
    notify(chatIds, {
      quizId: quiz.id,
      title: quiz.title,
      questionCount: quiz._count.questions,
      maxPoints: quiz.maxPoints,
      deadline,
    }).catch((err) => request.log.error({ err, quizId: quiz.id }, 'Quiz announcement failed'))

    return { id: quiz.id, status: quiz.status, deadline: quiz.deadline, notifiedChats: chatIds.length }
  })

  app.post('/quizzes/:id/close', { preHandler: app.authenticate }, async (request) => {
    const { id } = quizIdParams.parse(request.params)
    const group = await requireQuizGroup(id)
    assertCan(request.actor!, { resource: 'quiz', action: 'manage', ownerTeacherId: group.teacherId })
    await closeQuiz(id)
    return getQuizWithResults(id)
  })
}
