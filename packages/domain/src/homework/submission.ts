import { prisma, type HomeworkSubmissionStatus, type Prisma } from '@tashkurgan/db'
import { ConflictError, ForbiddenError, NotFoundError, tashkentToday, toStoredDate } from '@tashkurgan/shared'

/** How many photos one student may hand in for one homework. */
export const MAX_HOMEWORK_PHOTOS = 10
/** How many voice notes one student may hand in for one homework. */
export const MAX_HOMEWORK_VOICES = 10

/** A submission's photos and voice notes, in the order they were added -- what `submissionView` needs. */
export const SUBMISSION_FILES = {
  photos: { orderBy: { createdAt: 'asc' } },
  voices: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.HomeworkSubmissionInclude

/** What a submission is read with: its files and its due date. */
const SUBMISSION_INCLUDE = {
  ...SUBMISSION_FILES,
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

/** A voice note already stored on Telegram. */
export type StoredVoice = {
  fileId: string
  fileUniqueId: string
  /** Seconds. */
  duration: number
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
  voices: Array<{ id: string; duration: number }>
}

/** A submission as both apps show it -- file ids of ours only, never Telegram's. */
export function submissionView(submission: SubmissionWithPhotos, dueDate: Date | null) {
  return {
    id: submission.id,
    status: submission.status,
    submittedAt: submission.submittedAt,
    checkedAt: submission.checkedAt,
    teacherComment: submission.teacherComment,
    late: isLateSubmission(submission.submittedAt, dueDate),
    photos: submission.photos.map((p) => ({ id: p.id, width: p.width, height: p.height })),
    voices: submission.voices.map((v) => ({ id: v.id, duration: v.duration })),
  }
}

/**
 * The homework of `lessonSessionId`, if `studentId` may hand it in: they were enrolled in the
 * lesson's group, the group takes submissions, and the lesson has homework.
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

type FileKind = 'photo' | 'voice'

const FILE_LIMITS: Record<FileKind, { max: number; error: string }> = {
  photo: { max: MAX_HOMEWORK_PHOTOS, error: 'TOO_MANY_PHOTOS' },
  voice: { max: MAX_HOMEWORK_VOICES, error: 'TOO_MANY_VOICES' },
}

/**
 * Checks a file may still be added before it is stored anywhere: the homework is
 * submittable, not already checked, and has room for another photo (or voice note).
 */
async function assertCanAddHomeworkFile(studentId: string, lessonSessionId: string, kind: FileKind) {
  const target = await submittableHomework(studentId, lessonSessionId)
  const submission = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId: target.homework.id, studentId } },
    include: { _count: { select: { photos: true, voices: true } } },
  })
  if (submission?.status === 'CHECKED') throw new ConflictError('ALREADY_CHECKED')
  const count = kind === 'photo' ? submission?._count.photos : submission?._count.voices
  if ((count ?? 0) >= FILE_LIMITS[kind].max) throw new ConflictError(FILE_LIMITS[kind].error)
  return target
}

export const assertCanAddHomeworkPhoto = (studentId: string, lessonSessionId: string) =>
  assertCanAddHomeworkFile(studentId, lessonSessionId, 'photo')

/**
 * The student's submission for that lesson's homework, ready for one more file (created on the
 * first one). A submission sent back to be redone goes back to the teacher's queue.
 */
async function openSubmission(studentId: string, lessonSessionId: string, kind: FileKind, now: Date) {
  const { homework } = await assertCanAddHomeworkFile(studentId, lessonSessionId, kind)
  return prisma.homeworkSubmission.upsert({
    where: { homeworkId_studentId: { homeworkId: homework.id, studentId } },
    update: { status: 'SUBMITTED', submittedAt: now, checkedAt: null },
    create: { homeworkId: homework.id, studentId, submittedAt: now },
  })
}

/** Adds one photo to the student's submission for that lesson's homework. */
export async function addHomeworkPhoto(studentId: string, lessonSessionId: string, photo: StoredPhoto, now = new Date()) {
  const submission = await openSubmission(studentId, lessonSessionId, 'photo', now)
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

/** Adds one voice note to the student's submission for that lesson's homework. */
export async function addHomeworkVoice(studentId: string, lessonSessionId: string, voice: StoredVoice, now = new Date()) {
  const submission = await openSubmission(studentId, lessonSessionId, 'voice', now)
  await prisma.homeworkVoice.create({
    data: {
      submissionId: submission.id,
      telegramFileId: voice.fileId,
      telegramFileUniqueId: voice.fileUniqueId,
      duration: voice.duration,
      size: voice.size ?? null,
    },
  })
  return getHomeworkSubmission(submission.id)
}

const FILE_COUNT = { _count: { select: { photos: true, voices: true } } } as const

/** Removes a file the student took back; the submission goes with its last file. Not once it's checked. */
async function removeHomeworkFile(
  file: { submissionId: string; submission: { status: HomeworkSubmissionStatus; _count: { photos: number; voices: number } } } | null,
  remove: () => Promise<unknown>,
) {
  if (!file) throw new NotFoundError('File not found')
  if (file.submission.status === 'CHECKED') throw new ConflictError('ALREADY_CHECKED')

  if (file.submission._count.photos + file.submission._count.voices <= 1) {
    await prisma.homeworkSubmission.delete({ where: { id: file.submissionId } })
    return null
  }
  await remove()
  return getHomeworkSubmission(file.submissionId)
}

/** Takes one of the student's own photos back out. */
export async function removeHomeworkPhoto(studentId: string, photoId: string) {
  const photo = await prisma.homeworkPhoto.findFirst({
    where: { id: photoId, submission: { studentId } },
    include: { submission: { include: FILE_COUNT } },
  })
  return removeHomeworkFile(photo, () => prisma.homeworkPhoto.delete({ where: { id: photoId } }))
}

/** Takes one of the student's own voice notes back out. */
export async function removeHomeworkVoice(studentId: string, voiceId: string) {
  const voice = await prisma.homeworkVoice.findFirst({
    where: { id: voiceId, submission: { studentId } },
    include: { submission: { include: FILE_COUNT } },
  })
  return removeHomeworkFile(voice, () => prisma.homeworkVoice.delete({ where: { id: voiceId } }))
}

export function getHomeworkSubmission(id: string) {
  return prisma.homeworkSubmission.findUniqueOrThrow({
    where: { id },
    include: SUBMISSION_INCLUDE,
  })
}

/**
 * The homework a photo or voice note sent straight to the bot is for: the newest homework of the student's
 * current group that is still open to them (not already checked). Null when the group doesn't
 * take submissions or nothing is open.
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
