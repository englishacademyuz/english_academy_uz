import { prisma, type HomeworkSubmissionStatus, type Prisma } from '@tashkurgan/db'
import { ConflictError, ForbiddenError, NotFoundError, tashkentToday, toStoredDate } from '@tashkurgan/shared'

/** How many photos one student may hand in for one homework. */
export const MAX_HOMEWORK_PHOTOS = 10

/** What a submission is read with: its photos in the order they were added, and its due date. */
const SUBMISSION_INCLUDE = {
  photos: { orderBy: { createdAt: 'asc' } },
  homework: { select: { dueDate: true } },
} satisfies Prisma.HomeworkSubmissionInclude

/** A photo already stored on Telegram -- only its ids and size are kept here. */
export type StoredPhoto = {
  fileId: string
  fileUniqueId: string
  width?: number | null
  height?: number | null
  size?: number | null
}

/**
 * Handed in after the due date (a calendar day in Tashkent) -- still accepted, just flagged.
 * No due date means it can't be late.
 */
export function isLateSubmission(submittedAt: Date, dueDate: Date | null): boolean {
  if (!dueDate) return false
  return toStoredDate(tashkentToday(submittedAt)).getTime() > dueDate.getTime()
}

type SubmissionWithPhotos = {
  id: string
  status: HomeworkSubmissionStatus
  submittedAt: Date
  checkedAt: Date | null
  teacherComment: string | null
  photos: Array<{ id: string; width: number | null; height: number | null }>
}

/** A submission as both apps show it -- photo ids only, never Telegram's file ids. */
export function submissionView(submission: SubmissionWithPhotos, dueDate: Date | null) {
  return {
    id: submission.id,
    status: submission.status,
    submittedAt: submission.submittedAt,
    checkedAt: submission.checkedAt,
    teacherComment: submission.teacherComment,
    late: isLateSubmission(submission.submittedAt, dueDate),
    photos: submission.photos.map((p) => ({ id: p.id, width: p.width, height: p.height })),
  }
}

/**
 * The homework of `lessonSessionId`, if `studentId` may hand it in: they were enrolled in the
 * lesson's group, the group takes photo submissions, and the lesson has homework.
 * "Not found" for lessons that aren't the student's -- nothing to probe.
 */
export async function submittableHomework(studentId: string, lessonSessionId: string) {
  const lesson = await prisma.lessonSession.findFirst({
    where: { id: lessonSessionId, group: { enrollments: { some: { studentId } } } },
    include: { homework: true, group: { select: { homeworkSubmissionEnabled: true } } },
  })
  if (!lesson?.homework) throw new NotFoundError('Homework not found')
  if (!lesson.group.homeworkSubmissionEnabled) throw new ForbiddenError('SUBMISSIONS_DISABLED')
  return { lesson, homework: lesson.homework }
}

/**
 * Checks a photo may still be added before it is uploaded anywhere: the homework is
 * submittable, not already checked, and has room for another photo.
 */
export async function assertCanAddHomeworkPhoto(studentId: string, lessonSessionId: string) {
  const target = await submittableHomework(studentId, lessonSessionId)
  const submission = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId: target.homework.id, studentId } },
    include: { _count: { select: { photos: true } } },
  })
  if (submission?.status === 'CHECKED') throw new ConflictError('ALREADY_CHECKED')
  if ((submission?._count.photos ?? 0) >= MAX_HOMEWORK_PHOTOS) throw new ConflictError('TOO_MANY_PHOTOS')
  return target
}

/**
 * Adds one photo to the student's submission for that lesson's homework (creating it on the
 * first photo). A submission sent back to be redone goes back to the teacher's queue.
 */
export async function addHomeworkPhoto(studentId: string, lessonSessionId: string, photo: StoredPhoto, now = new Date()) {
  const { homework } = await assertCanAddHomeworkPhoto(studentId, lessonSessionId)
  const submission = await prisma.homeworkSubmission.upsert({
    where: { homeworkId_studentId: { homeworkId: homework.id, studentId } },
    update: { status: 'SUBMITTED', submittedAt: now, checkedAt: null },
    create: { homeworkId: homework.id, studentId, submittedAt: now },
  })
  await prisma.homeworkPhoto.create({
    data: {
      submissionId: submission.id,
      telegramFileId: photo.fileId,
      telegramFileUniqueId: photo.fileUniqueId,
      width: photo.width ?? null,
      height: photo.height ?? null,
      size: photo.size ?? null,
    },
  })
  return getHomeworkSubmission(submission.id)
}

/** Takes one of the student's own photos back out; an emptied submission is removed. Not once it's checked. */
export async function removeHomeworkPhoto(studentId: string, photoId: string) {
  const photo = await prisma.homeworkPhoto.findFirst({
    where: { id: photoId, submission: { studentId } },
    include: { submission: { include: { _count: { select: { photos: true } } } } },
  })
  if (!photo) throw new NotFoundError('Photo not found')
  if (photo.submission.status === 'CHECKED') throw new ConflictError('ALREADY_CHECKED')

  if (photo.submission._count.photos <= 1) {
    await prisma.homeworkSubmission.delete({ where: { id: photo.submissionId } })
    return null
  }
  await prisma.homeworkPhoto.delete({ where: { id: photoId } })
  return getHomeworkSubmission(photo.submissionId)
}

export function getHomeworkSubmission(id: string) {
  return prisma.homeworkSubmission.findUniqueOrThrow({
    where: { id },
    include: SUBMISSION_INCLUDE,
  })
}

/**
 * The homework a photo sent straight to the bot is for: the newest homework of the student's
 * current group that is still open to them (not already checked). Null when the group doesn't
 * take photo submissions or nothing is open.
 */
export async function latestOpenHomework(studentId: string) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, status: 'ACTIVE', group: { homeworkSubmissionEnabled: true } },
    orderBy: { startDate: 'desc' },
  })
  if (!enrollment) return null
  return prisma.lessonSession.findFirst({
    where: {
      groupId: enrollment.groupId,
      homework: { is: { submissions: { none: { studentId, status: 'CHECKED' } } } },
    },
    orderBy: { date: 'desc' },
    include: { homework: true },
  })
}

export type HomeworkReviewInput = {
  status: Extract<HomeworkSubmissionStatus, 'CHECKED' | 'RETURNED'>
  comment?: string | null
}

/** The teacher's verdict on a submission: checked, or sent back to be redone (with what to fix). */
export async function reviewHomeworkSubmission(submissionId: string, input: HomeworkReviewInput, now = new Date()) {
  const comment = input.comment?.trim() || null
  return prisma.homeworkSubmission.update({
    where: { id: submissionId },
    data: { status: input.status, teacherComment: comment, checkedAt: now },
    include: SUBMISSION_INCLUDE,
  })
}
