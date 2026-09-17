import { prisma, type HomeworkResultStatus } from '@tashkurgan/db'
import { NotFoundError } from '@tashkurgan/shared'

/**
 * Homework performance % excludes ungraded (status-only) completions --
 * only entries with a recorded score count toward the average (§51.1).
 * Returns null when nothing is graded yet.
 */
export function calculateHomeworkRate(scores: Array<number | null>): number | null {
  const graded = scores.filter((score): score is number => score !== null)
  if (graded.length === 0) return null
  return graded.reduce((sum, score) => sum + score, 0) / graded.length
}

export type HomeworkResultInput = {
  studentId: string
  status: HomeworkResultStatus
  score?: number | null
  teacherComment?: string
}

/** Records (or corrects) one student's checked homework outcome, per Homework -- typically entered during a later session (§DOMAIN-MODEL §4). */
export async function recordHomeworkResults(homeworkId: string, results: HomeworkResultInput[]) {
  const homework = await prisma.homework.findUnique({ where: { id: homeworkId } })
  if (!homework) throw new NotFoundError('Homework not found')

  return prisma.$transaction(
    results.map((result) =>
      prisma.homeworkResult.upsert({
        where: { homeworkId_studentId: { homeworkId, studentId: result.studentId } },
        update: {
          status: result.status,
          score: result.score ?? null,
          teacherComment: result.teacherComment,
        },
        create: {
          homeworkId,
          studentId: result.studentId,
          status: result.status,
          score: result.score ?? null,
          teacherComment: result.teacherComment,
        },
      }),
    ),
  )
}
