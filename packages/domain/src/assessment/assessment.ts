import { prisma } from '@tashkurgan/db'
import { NotFoundError, ValidationError } from '@tashkurgan/shared'

/** The one place raw scores are normalized to a percentage (§51.1) -- everything that averages across differing max scores goes through this. */
export function toPercentage(score: number, maxScore: number): number {
  if (maxScore <= 0) throw new ValidationError('maxScore must be positive')
  return (score / maxScore) * 100
}

export function averagePercentage(scores: Array<{ score: number; maxScore: number }>): number | null {
  if (scores.length === 0) return null
  const total = scores.reduce((sum, entry) => sum + toPercentage(entry.score, entry.maxScore), 0)
  return total / scores.length
}

export type AssessmentResultInput = { studentId: string; score: number }

/** Records a whole group's results for one Assessment in one transaction (the §19 "Ali: 85, Madina: 92..." pattern). */
export async function recordAssessmentResults(assessmentId: string, results: AssessmentResultInput[]) {
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } })
  if (!assessment) throw new NotFoundError('Assessment not found')

  for (const result of results) {
    if (result.score < 0 || result.score > assessment.maxScore) {
      throw new ValidationError(
        `Score for student ${result.studentId} must be between 0 and ${assessment.maxScore}`,
      )
    }
  }

  return prisma.$transaction(
    results.map((result) =>
      prisma.assessmentResult.upsert({
        where: { assessmentId_studentId: { assessmentId, studentId: result.studentId } },
        update: { score: result.score },
        create: { assessmentId, studentId: result.studentId, score: result.score },
      }),
    ),
  )
}
