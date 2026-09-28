import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { finalizeExpiredAttempts } from '@tashkurgan/domain'
import { buildApp } from '../src/app'
import type { QuizAnnouncement } from '../src/routes/quizzes'
import { TEST_BOT_TOKEN, createTeacherUser, loginAs, miniAppAuth, resetDb, seedAcademicStructure } from './helpers'

// Three questions; the correct option is always the one named "right".
const QUIZ_BODY = {
  date: '2026-09-28',
  title: 'Daily quiz',
  maxPoints: 9,
  questions: [1, 2, 3].map((n) => ({
    text: `Question ${n}`,
    options: [
      { text: 'wrong', isCorrect: false },
      { text: 'right', isCorrect: true },
    ],
  })),
}

describe('quizzes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  const announcements: Array<{ chatIds: string[]; quiz: QuizAnnouncement }> = []

  beforeAll(async () => {
    app = await buildApp({
      telegramBotToken: TEST_BOT_TOKEN,
      quizNotifier: async (chatIds, quiz) => {
        announcements.push({ chatIds, quiz })
      },
    })
  })

  afterEach(async () => {
    announcements.length = 0
    await resetDb()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  async function createAndSend(cookie: string, groupId: string) {
    const created = await app.inject({ method: 'POST', url: `/groups/${groupId}/quizzes`, headers: { cookie }, payload: QUIZ_BODY })
    expect(created.statusCode).toBe(200)
    const quizId = created.json().id as string
    const sent = await app.inject({
      method: 'POST',
      url: `/quizzes/${quizId}/send`,
      headers: { cookie },
      payload: { deadline: new Date(Date.now() + 3_600_000).toISOString() },
    })
    expect(sent.statusCode).toBe(200)
    return quizId
  }

  it("saves a draft inside that day's lesson, then freezes it once sent", async () => {
    const { group } = await seedAcademicStructure()
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')

    const created = await app.inject({ method: 'POST', url: `/groups/${group.id}/quizzes`, headers: { cookie }, payload: QUIZ_BODY })
    expect(created.statusCode).toBe(200)
    const quiz = created.json()
    expect(quiz.status).toBe('DRAFT')
    expect(quiz.questions).toHaveLength(3)

    // The lesson for that date didn't exist yet -- creating the quiz opened it.
    const session = await prisma.lessonSession.findUniqueOrThrow({ where: { id: quiz.lessonSessionId } })
    expect(session.groupId).toBe(group.id)

    const edited = await app.inject({
      method: 'PUT',
      url: `/quizzes/${quiz.id}`,
      headers: { cookie },
      payload: { ...QUIZ_BODY, title: 'Renamed' },
    })
    expect(edited.json().title).toBe('Renamed')

    await app.inject({
      method: 'POST',
      url: `/quizzes/${quiz.id}/send`,
      headers: { cookie },
      payload: { deadline: new Date(Date.now() + 3_600_000).toISOString() },
    })
    const afterSend = await app.inject({ method: 'PUT', url: `/quizzes/${quiz.id}`, headers: { cookie }, payload: QUIZ_BODY })
    expect(afterSend.statusCode).toBe(409)

    const listed = await app.inject({ method: 'GET', url: `/groups/${group.id}/quizzes`, headers: { cookie } })
    expect(listed.json()).toMatchObject([{ id: quiz.id, status: 'SENT', isOpen: true, questionCount: 3 }])
  })

  it("keeps another teacher out of the group's quizzes", async () => {
    const { group } = await seedAcademicStructure()
    await createTeacherUser('teacher2', 'teacher12345')
    const cookie = await loginAs(app, 'teacher2', 'teacher12345')

    const res = await app.inject({ method: 'POST', url: `/groups/${group.id}/quizzes`, headers: { cookie }, payload: QUIZ_BODY })
    expect(res.statusCode).toBe(403)
  })

  /** The student side, as the Mini App calls it: authenticated only by signed Telegram init data. */
  const asChat = (chatId: string) => ({
    start: (quizId: string) =>
      app.inject({ method: 'POST', url: `/student/quizzes/${quizId}/start`, headers: miniAppAuth(chatId) }),
    answer: (attemptId: string, optionId: string) =>
      app.inject({
        method: 'POST',
        url: `/student/quiz-attempts/${attemptId}/answer`,
        headers: miniAppAuth(chatId),
        payload: { optionId },
      }),
  })

  it('announces to every linked chat, lets one of them take the single attempt, and awards proportional points', async () => {
    const { group, student } = await seedAcademicStructure()
    // The student's own chat and a parent's chat, both linked to the same student.
    await prisma.telegramLink.createMany({
      data: [
        { chatId: '701', studentId: student.id },
        { chatId: '702', studentId: student.id },
      ],
    })
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const quizId = await createAndSend(cookie, group.id)

    expect(announcements).toHaveLength(1)
    expect(announcements[0].chatIds.sort()).toEqual(['701', '702'])
    expect(announcements[0].quiz).toMatchObject({ quizId, questionCount: 3, maxPoints: 9 })

    const started = await asChat('701').start(quizId)
    expect(started.statusCode).toBe(200)
    let state = started.json()
    expect(state).toMatchObject({ kind: 'question', index: 0, total: 3 })
    // The question sent to the student never reveals which option is correct.
    expect(JSON.stringify(state)).not.toContain('isCorrect')

    // Answer right, wrong, right.
    for (const wanted of ['right', 'wrong', 'right']) {
      const option = state.question.options.find((o: { text: string }) => o.text === wanted)
      state = (await asChat('701').answer(state.attemptId, option.id)).json()
    }

    expect(state.kind).toBe('completed')
    expect(state.review).toMatchObject({ correctCount: 2, total: 3, points: 6, maxPoints: 9 })
    expect(state.review.questions[1]).toMatchObject({ isCorrect: false, chosen: 'wrong', correct: 'right' })

    const ledger = await prisma.pointTransaction.findMany({ where: { studentId: student.id } })
    expect(ledger).toMatchObject([{ activityType: 'QUIZ', points: 6, groupId: group.id }])

    // No retake: the parent's chat starting later just gets the same review.
    const again = (await asChat('702').start(quizId)).json()
    expect(again.kind).toBe('completed')
    expect(again.review.correctCount).toBe(2)
    expect(await prisma.quizAttempt.count()).toBe(1)
    expect(await prisma.pointTransaction.count()).toBe(1)

    const results = await app.inject({ method: 'GET', url: `/quizzes/${quizId}`, headers: { cookie } })
    expect(results.json().results).toMatchObject([
      { student: { id: student.id }, status: 'COMPLETED', correctCount: 2, points: 6 },
    ])
  })

  it('scores an unfinished attempt on what was answered once the deadline passes', async () => {
    const { group, student } = await seedAcademicStructure()
    await prisma.telegramLink.create({ data: { chatId: '703', studentId: student.id } })
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const quizId = await createAndSend(cookie, group.id)

    const state = (await asChat('703').start(quizId)).json()
    const right = state.question.options.find((o: { text: string }) => o.text === 'right')
    await asChat('703').answer(state.attemptId, right.id)

    await prisma.quiz.update({ where: { id: quizId }, data: { deadline: new Date(Date.now() - 1000) } })
    expect(await finalizeExpiredAttempts()).toBe(1)

    const attempt = await prisma.quizAttempt.findFirstOrThrow({ where: { quizId } })
    expect(attempt).toMatchObject({ correctCount: 1, points: 3 })
    expect(attempt.completedAt).not.toBeNull()

    // Answering after the deadline changes nothing.
    const wrong = await prisma.quizOption.findFirstOrThrow({ where: { question: { quizId, position: 1 }, isCorrect: false } })
    const late = (await asChat('703').answer(attempt.id, wrong.id)).json()
    expect(late.kind).toBe('completed')
    expect(await prisma.quizAnswer.count()).toBe(1)
  })

  it("refuses to start another group's quiz or answer someone else's attempt", async () => {
    const { group, level, teacher, student } = await seedAcademicStructure()
    const outsider = await prisma.student.create({ data: { firstName: 'Out', lastName: 'Sider', dob: new Date('2012-01-01') } })
    const otherGroup = await prisma.group.create({
      data: { name: 'B', levelId: level.id, teacherId: teacher.id, scheduleDays: ['TUE'], scheduleTime: '19:00', startDate: new Date() },
    })
    await prisma.enrollment.create({
      data: { studentId: outsider.id, groupId: otherGroup.id, subjectId: (await prisma.subject.findFirstOrThrow()).id, startDate: new Date(), status: 'ACTIVE' },
    })
    await prisma.telegramLink.createMany({
      data: [
        { chatId: '704', studentId: outsider.id },
        { chatId: '705', studentId: student.id },
      ],
    })
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const quizId = await createAndSend(cookie, group.id)

    expect(announcements[0].chatIds).not.toContain('704')

    const refused = await asChat('704').start(quizId)
    expect(refused.statusCode).toBe(404)

    // The real student starts; the outsider tries to answer on their attempt id.
    const state = (await asChat('705').start(quizId)).json()
    const hijack = await asChat('704').answer(state.attemptId, state.question.options[0].id)
    expect(hijack.statusCode).toBe(404)
    expect(await prisma.quizAnswer.count()).toBe(0)
  })
})
