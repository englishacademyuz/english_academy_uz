import { prisma, type Prisma } from '@tashkurgan/db'
import { ConflictError, NotFoundError, ValidationError } from '@tashkurgan/shared'

const MIN_OPTIONS = 2
const MAX_OPTIONS = 6

export type QuizInput = {
  title: string
  maxPoints: number
  questions: Array<{ text: string; options: Array<{ text: string; isCorrect: boolean }> }>
}

/** Points are proportional to the share answered correctly, rounded to a whole point. */
export function quizPoints(maxPoints: number, correctCount: number, totalQuestions: number): number {
  if (totalQuestions === 0) return 0
  return Math.round((maxPoints * correctCount) / totalQuestions)
}

export function isQuizOpen(quiz: { status: string; deadline: Date | null }, now = new Date()): boolean {
  return quiz.status === 'SENT' && quiz.deadline !== null && quiz.deadline > now
}

export function validateQuizInput(input: QuizInput): void {
  if (!input.title.trim()) throw new ValidationError('Quiz title is required')
  if (!Number.isInteger(input.maxPoints) || input.maxPoints < 0) {
    throw new ValidationError('Max points must be a whole number, 0 or more')
  }
  if (input.questions.length === 0) throw new ValidationError('A quiz needs at least one question')
  input.questions.forEach((question, i) => {
    const n = i + 1
    if (!question.text.trim()) throw new ValidationError(`Question ${n} has no text`)
    if (question.options.length < MIN_OPTIONS || question.options.length > MAX_OPTIONS) {
      throw new ValidationError(`Question ${n} needs ${MIN_OPTIONS}-${MAX_OPTIONS} options`)
    }
    if (question.options.some((o) => !o.text.trim())) throw new ValidationError(`Question ${n} has an empty option`)
    if (question.options.filter((o) => o.isCorrect).length !== 1) {
      throw new ValidationError(`Question ${n} needs exactly one correct option`)
    }
  })
}

function questionsCreate(input: QuizInput) {
  return {
    create: input.questions.map((question, qi) => ({
      position: qi,
      text: question.text.trim(),
      options: {
        create: question.options.map((option, oi) => ({
          position: oi,
          text: option.text.trim(),
          isCorrect: option.isCorrect,
        })),
      },
    })),
  }
}

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === 'P2002'

const withQuestions = {
  questions: { orderBy: { position: 'asc' }, include: { options: { orderBy: { position: 'asc' } } } },
} satisfies Prisma.QuizInclude

/** Creates a Draft quiz inside the group's lesson for `date`, opening that lesson if it wasn't recorded yet. */
export async function createQuiz(groupId: string, teacherId: string, date: Date, input: QuizInput) {
  validateQuizInput(input)
  return prisma.$transaction(async (tx) => {
    const session = await tx.lessonSession.upsert({
      where: { groupId_date: { groupId, date } },
      update: {},
      create: { groupId, teacherId, date },
    })
    return tx.quiz.create({
      data: {
        lessonSessionId: session.id,
        title: input.title.trim(),
        maxPoints: input.maxPoints,
        questions: questionsCreate(input),
      },
      include: withQuestions,
    })
  })
}

async function requireDraft(tx: Prisma.TransactionClient, quizId: string) {
  const quiz = await tx.quiz.findUnique({ where: { id: quizId } })
  if (!quiz) throw new NotFoundError('Quiz not found')
  if (quiz.status !== 'DRAFT') throw new ConflictError('A sent quiz can no longer be changed')
  return quiz
}

export async function updateQuizDraft(quizId: string, input: QuizInput) {
  validateQuizInput(input)
  return prisma.$transaction(async (tx) => {
    await requireDraft(tx, quizId)
    await tx.quizQuestion.deleteMany({ where: { quizId } })
    return tx.quiz.update({
      where: { id: quizId },
      data: { title: input.title.trim(), maxPoints: input.maxPoints, questions: questionsCreate(input) },
      include: withQuestions,
    })
  })
}

export async function deleteQuizDraft(quizId: string) {
  await prisma.$transaction(async (tx) => {
    await requireDraft(tx, quizId)
    await tx.quiz.delete({ where: { id: quizId } })
  })
}

/**
 * Freezes the quiz and opens it until `deadline`. Returns the Telegram chats
 * to notify: every chat linked to a student actively enrolled in the group.
 */
export async function sendQuiz(quizId: string, deadline: Date, now = new Date()) {
  if (deadline <= now) throw new ValidationError('The deadline must be in the future')

  const quiz = await prisma.$transaction(async (tx) => {
    await requireDraft(tx, quizId)
    return tx.quiz.update({
      where: { id: quizId },
      data: { status: 'SENT', sentAt: now, deadline },
      include: { lessonSession: true, _count: { select: { questions: true } } },
    })
  })

  const links = await prisma.telegramLink.findMany({
    where: { student: { enrollments: { some: { groupId: quiz.lessonSession.groupId, status: 'ACTIVE' } } } },
    select: { chatId: true },
  })
  return { quiz, chatIds: links.map((l) => l.chatId) }
}

/** Closes a sent quiz now (by moving its deadline) and scores any unfinished attempts. */
export async function closeQuiz(quizId: string, now = new Date()) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } })
  if (!quiz) throw new NotFoundError('Quiz not found')
  if (!isQuizOpen(quiz, now)) throw new ConflictError('This quiz is not open')
  await prisma.quiz.update({ where: { id: quizId }, data: { deadline: now } })
  await finalizeExpiredAttempts(now)
}

/**
 * Scores an attempt on what it has answered so far and records its points.
 * Idempotent: an attempt already scored (e.g. by a concurrent answer and the
 * deadline sweep) is left as it is.
 */
async function completeAttempt(attemptId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.quizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: {
        quiz: { include: { lessonSession: true, _count: { select: { questions: true } } } },
        answers: true,
      },
    })
    if (attempt.completedAt) return attempt

    const correctCount = attempt.answers.filter((a) => a.isCorrect).length
    const points = quizPoints(attempt.quiz.maxPoints, correctCount, attempt.quiz._count.questions)

    const claimed = await tx.quizAttempt.updateMany({
      where: { id: attemptId, completedAt: null },
      data: { completedAt: now, correctCount, points },
    })
    if (claimed.count === 1 && points > 0) {
      await tx.pointTransaction.create({
        data: {
          studentId: attempt.studentId,
          groupId: attempt.quiz.lessonSession.groupId,
          activityType: 'QUIZ',
          points,
          note: attempt.quiz.title,
          quizAttemptId: attemptId,
        },
      })
    }
    return tx.quizAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { answers: true, quiz: true } })
  })
}

/** Scores every unfinished attempt whose quiz deadline has passed. Safe to run repeatedly. */
export async function finalizeExpiredAttempts(now = new Date()) {
  const expired = await prisma.quizAttempt.findMany({
    where: { completedAt: null, quiz: { deadline: { lte: now } } },
    select: { id: true },
  })
  for (const attempt of expired) await completeAttempt(attempt.id, now)
  return expired.length
}

async function requireActiveEnrollment(studentId: string, groupId: string) {
  const enrollment = await prisma.enrollment.findFirst({ where: { studentId, groupId, status: 'ACTIVE' } })
  if (!enrollment) throw new NotFoundError('Quiz not found')
}

/** Open quizzes of the student's active groups, with the student's attempt (if any). */
export async function listOpenQuizzesForStudent(studentId: string, now = new Date()) {
  return prisma.quiz.findMany({
    where: {
      status: 'SENT',
      deadline: { gt: now },
      lessonSession: { group: { enrollments: { some: { studentId, status: 'ACTIVE' } } } },
    },
    include: { attempts: { where: { studentId } }, _count: { select: { questions: true } } },
    orderBy: { deadline: 'asc' },
  })
}

export type AttemptState =
  | { kind: 'question'; attemptId: string; quizTitle: string; index: number; total: number; question: NextQuestion }
  | { kind: 'completed'; review: AttemptReview }

type NextQuestion = { id: string; text: string; options: Array<{ id: string; text: string }> }

export type AttemptReview = {
  quizTitle: string
  correctCount: number
  total: number
  points: number
  maxPoints: number
  questions: Array<{ text: string; chosen: string | null; correct: string; isCorrect: boolean }>
}

async function attemptState(attemptId: string): Promise<AttemptState> {
  const attempt = await prisma.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { quiz: { include: withQuestions }, answers: true },
  })
  const questions = attempt.quiz.questions

  if (attempt.completedAt) {
    const chosenByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a.optionId]))
    return {
      kind: 'completed',
      review: {
        quizTitle: attempt.quiz.title,
        correctCount: attempt.correctCount ?? 0,
        total: questions.length,
        points: attempt.points ?? 0,
        maxPoints: attempt.quiz.maxPoints,
        questions: questions.map((q) => {
          const chosenId = chosenByQuestion.get(q.id)
          const correct = q.options.find((o) => o.isCorrect)!
          return {
            text: q.text,
            chosen: q.options.find((o) => o.id === chosenId)?.text ?? null,
            correct: correct.text,
            isCorrect: chosenId === correct.id,
          }
        }),
      },
    }
  }

  const answered = new Set(attempt.answers.map((a) => a.questionId))
  const index = questions.findIndex((q) => !answered.has(q.id))
  const next = questions[index]
  return {
    kind: 'question',
    attemptId: attempt.id,
    quizTitle: attempt.quiz.title,
    index,
    total: questions.length,
    question: { id: next.id, text: next.text, options: next.options.map((o) => ({ id: o.id, text: o.text })) },
  }
}

/**
 * Starts the student's one attempt, or resumes it where they left off. Once
 * the attempt is scored this just returns the review -- there is no retake.
 */
export async function startQuizAttempt(quizId: string, studentId: string, now = new Date()): Promise<AttemptState> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { lessonSession: true } })
  if (!quiz || quiz.status !== 'SENT') throw new NotFoundError('Quiz not found')
  await requireActiveEnrollment(studentId, quiz.lessonSession.groupId)

  const existing = await prisma.quizAttempt.findUnique({ where: { quizId_studentId: { quizId, studentId } } })
  if (!isQuizOpen(quiz, now)) {
    if (!existing) throw new ConflictError('This quiz is closed')
    await completeAttempt(existing.id, now)
    return attemptState(existing.id)
  }

  const attempt =
    existing ??
    (await prisma.quizAttempt
      .create({ data: { quizId, studentId, startedAt: now } })
      // Two linked chats pressing Start at once: the loser just resumes the winner's attempt.
      .catch((err: unknown) => {
        if (!isUniqueViolation(err)) throw err
        return prisma.quizAttempt.findUniqueOrThrow({ where: { quizId_studentId: { quizId, studentId } } })
      }))
  return attemptState(attempt.id)
}

/**
 * Records the chosen option for the attempt's current question and moves on;
 * the last answer scores the attempt. A question already answered (e.g. a
 * double tap, or another linked chat) keeps its first answer.
 */
export async function answerQuizQuestion(
  attemptId: string,
  optionId: string,
  studentId: string,
  now = new Date(),
): Promise<AttemptState> {
  const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId }, include: { quiz: true } })
  if (!attempt || attempt.studentId !== studentId) throw new NotFoundError('Quiz not found')
  if (attempt.completedAt) return attemptState(attemptId)

  if (!isQuizOpen(attempt.quiz, now)) {
    await completeAttempt(attemptId, now)
    return attemptState(attemptId)
  }

  const option = await prisma.quizOption.findUnique({ where: { id: optionId }, include: { question: true } })
  if (!option || option.question.quizId !== attempt.quizId) throw new NotFoundError('Option not found')

  await prisma.quizAnswer
    .create({
      data: {
        attemptId,
        questionId: option.questionId,
        optionId,
        isCorrect: option.isCorrect,
        answeredAt: now,
      },
    })
    .catch((err: unknown) => {
      // Unique (attempt, question): the first answer stands.
      if (!isUniqueViolation(err)) throw err
    })

  const [answered, total] = await Promise.all([
    prisma.quizAnswer.count({ where: { attemptId } }),
    prisma.quizQuestion.count({ where: { quizId: attempt.quizId } }),
  ])
  if (answered >= total) await completeAttempt(attemptId, now)
  return attemptState(attemptId)
}

export type QuizResultRow = {
  student: { id: string; firstName: string; lastName: string }
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
  answeredCount: number
  correctCount: number | null
  points: number | null
}

/** The quiz with its questions and one result row per student actively enrolled in its group. */
export async function getQuizWithResults(quizId: string, now = new Date()) {
  await finalizeExpiredAttempts(now)
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      ...withQuestions,
      lessonSession: true,
      attempts: { include: { _count: { select: { answers: true } } } },
    },
  })
  if (!quiz) throw new NotFoundError('Quiz not found')

  const enrollments = await prisma.enrollment.findMany({
    where: { groupId: quiz.lessonSession.groupId, status: 'ACTIVE' },
    include: { student: true },
    orderBy: { student: { firstName: 'asc' } },
  })
  const attemptByStudent = new Map(quiz.attempts.map((a) => [a.studentId, a]))
  const results: QuizResultRow[] = enrollments.map(({ student }) => {
    const attempt = attemptByStudent.get(student.id)
    return {
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName },
      status: !attempt ? 'NOT_STARTED' : attempt.completedAt ? 'COMPLETED' : 'IN_PROGRESS',
      answeredCount: attempt?._count.answers ?? 0,
      correctCount: attempt?.correctCount ?? null,
      points: attempt?.points ?? null,
    }
  })

  return {
    id: quiz.id,
    lessonSessionId: quiz.lessonSessionId,
    date: quiz.lessonSession.date,
    title: quiz.title,
    maxPoints: quiz.maxPoints,
    status: quiz.status,
    sentAt: quiz.sentAt,
    deadline: quiz.deadline,
    isOpen: isQuizOpen(quiz, now),
    questions: quiz.questions,
    results,
  }
}

/**
 * A group's quizzes (newest lesson first), optionally within a date range, each
 * with a light per-student summary -- enough for the quiz list and the marks table.
 */
export async function listGroupQuizzes(groupId: string, range?: { from?: Date; to?: Date }, now = new Date()) {
  await finalizeExpiredAttempts(now)
  const quizzes = await prisma.quiz.findMany({
    where: {
      lessonSession: {
        groupId,
        ...(range?.from || range?.to
          ? { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } }
          : {}),
      },
    },
    include: {
      lessonSession: { select: { date: true } },
      attempts: { select: { studentId: true, completedAt: true, correctCount: true, points: true } },
      _count: { select: { questions: true } },
    },
    orderBy: [{ lessonSession: { date: 'desc' } }, { createdAt: 'desc' }],
  })
  return quizzes.map((quiz) => ({
    id: quiz.id,
    date: quiz.lessonSession.date,
    title: quiz.title,
    maxPoints: quiz.maxPoints,
    status: quiz.status,
    sentAt: quiz.sentAt,
    deadline: quiz.deadline,
    isOpen: isQuizOpen(quiz, now),
    questionCount: quiz._count.questions,
    attempts: quiz.attempts,
  }))
}

/**
 * Every sent quiz of the student's active groups, newest lesson first, with the
 * student's own attempt summary -- what the Mini App's quiz list shows. Correct
 * answers are never included here; they're only revealed through a scored attempt.
 */
export async function listQuizzesForStudent(studentId: string, now = new Date()) {
  await finalizeExpiredAttempts(now)
  const quizzes = await prisma.quiz.findMany({
    where: {
      status: 'SENT',
      lessonSession: { group: { enrollments: { some: { studentId, status: 'ACTIVE' } } } },
    },
    include: {
      lessonSession: { select: { date: true } },
      attempts: { where: { studentId }, include: { _count: { select: { answers: true } } } },
      _count: { select: { questions: true } },
    },
    orderBy: [{ lessonSession: { date: 'desc' } }, { sentAt: 'desc' }],
    take: 50,
  })
  return quizzes.map((quiz) => {
    const attempt = quiz.attempts[0]
    return {
      id: quiz.id,
      title: quiz.title,
      date: quiz.lessonSession.date,
      deadline: quiz.deadline,
      isOpen: isQuizOpen(quiz, now),
      questionCount: quiz._count.questions,
      maxPoints: quiz.maxPoints,
      attempt: attempt
        ? {
            completed: !!attempt.completedAt,
            answeredCount: attempt._count.answers,
            correctCount: attempt.correctCount,
            points: attempt.points,
          }
        : null,
    }
  })
}
