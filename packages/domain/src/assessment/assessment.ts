import { prisma, type AssessmentType } from '@tashkurgan/db'
import { NotFoundError, ValidationError } from '@tashkurgan/shared'
import { syncAssessmentPoints } from '../points/points'

/** The one place raw scores are normalized to a percentage (§51.1) -- everything that averages across differing max scores goes through this. */
export function toPercentage(score: number, maxScore: number): number {
  if (maxScore <= 0) throw new ValidationError('maxScore must be positive')
  return (score / maxScore) * 100
}

/** How many Rating points a score is worth, scaled linearly off the category's pointsWorth -- a 50% result on a 2-point category earns 1 point, regardless of whether the category is graded 0-5 or 0-100. */
export function pointsForScore(pointsWorth: number, score: number, maxScore: number): number {
  return Math.round((pointsWorth * toPercentage(score, maxScore)) / 100)
}

export function averagePercentage(scores: Array<{ score: number; maxScore: number }>): number | null {
  if (scores.length === 0) return null
  const total = scores.reduce((sum, entry) => sum + toPercentage(entry.score, entry.maxScore), 0)
  return total / scores.length
}

export type AssessmentResultInput = { studentId: string; score: number }

export type UpsertAssessmentInput = {
  groupId: string
  categoryId: string
  title: string
  type: AssessmentType
  date: Date
  maxScore?: number
  teacherComment?: string
}

/**
 * Get-or-create the Assessment for (group, category, date, title) -- lets a
 * teacher grade a cell without first knowing whether that day's row already
 * exists, the same way recordLessonSession upserts on (group, date). Also
 * where §18/§43's "category must belong to this group's Level" rule and the
 * "a retired category can't be graded against" rule are enforced -- neither
 * was checked before.
 */
export async function upsertAssessment(input: UpsertAssessmentInput) {
  const group = await prisma.group.findUnique({ where: { id: input.groupId } })
  if (!group) throw new NotFoundError('Group not found')

  const category = await prisma.assessmentCategory.findUnique({ where: { id: input.categoryId } })
  if (!category) throw new NotFoundError('Assessment category not found')
  if (category.levelId !== group.levelId) {
    throw new ValidationError("Assessment category does not belong to this group's level")
  }
  if (category.retiredAt) {
    throw new ValidationError('Assessment category has been retired')
  }

  return prisma.assessment.upsert({
    where: {
      groupId_categoryId_date_title: {
        groupId: input.groupId,
        categoryId: input.categoryId,
        date: input.date,
        title: input.title,
      },
    },
    update: {},
    create: {
      groupId: input.groupId,
      categoryId: input.categoryId,
      title: input.title,
      type: input.type,
      date: input.date,
      maxScore: input.maxScore ?? category.maxScore,
      teacherComment: input.teacherComment,
    },
  })
}

/**
 * Records a whole group's results for one Assessment in one transaction (the §19 "Ali: 85,
 * Madina: 92..." pattern). When the category has a pointsWorth, each result's Rating points are
 * synced in the same transaction -- re-grading a cell recomputes its one linked PointTransaction
 * rather than piling up duplicate ledger entries.
 */
export async function recordAssessmentResults(assessmentId: string, results: AssessmentResultInput[]) {
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId }, include: { category: true } })
  if (!assessment) throw new NotFoundError('Assessment not found')

  for (const result of results) {
    if (result.score < 0 || result.score > assessment.maxScore) {
      throw new ValidationError(
        `Score for student ${result.studentId} must be between 0 and ${assessment.maxScore}`,
      )
    }
  }

  return prisma.$transaction(async (tx) => {
    const saved = await Promise.all(
      results.map((result) =>
        tx.assessmentResult.upsert({
          where: { assessmentId_studentId: { assessmentId, studentId: result.studentId } },
          update: { score: result.score },
          create: { assessmentId, studentId: result.studentId, score: result.score },
        }),
      ),
    )

    if (assessment.category.pointsWorth > 0) {
      await Promise.all(
        saved.map((result) =>
          syncAssessmentPoints(tx, {
            assessmentResultId: result.id,
            studentId: result.studentId,
            groupId: assessment.groupId,
            points: pointsForScore(assessment.category.pointsWorth, result.score, assessment.maxScore),
          }),
        ),
      )
    }

    return saved
  })
}
