import { prisma, type HomeworkSubmissionStatus, type Prisma } from '@tashkurgan/db'
import { ConflictError, ForbiddenError, NotFoundError } from '@tashkurgan/shared'

/** How many photos one student may hand in for one homework task. */
export const MAX_HOMEWORK_PHOTOS = 10
/** How many voice notes one student may hand in for one homework task. */
export const MAX_HOMEWORK_VOICES = 10
/** How many videos one student may hand in for one homework task. */
export const MAX_HOMEWORK_VIDEOS = 5

/** The task key of a homework's written part (its instructions) -- a picture task's key is the picture's id. */
export const WRITTEN_TASK = 'written'

/**
 * A submission's photos, voice notes and videos, in the order they were added, and the teacher's
 * spoken feedback -- what `submissionView` needs.
 */
export const SUBMISSION_FILES = {
  photos: { orderBy: { createdAt: 'asc' } },
  voices: { orderBy: { createdAt: 'asc' } },
  videos: { orderBy: { createdAt: 'asc' } },
  feedbackVoice: true,
} satisfies Prisma.HomeworkSubmissionInclude

/** Which task a submission is for and when that's due: its picture task's, else the written homework's. */
export const SUBMISSION_TASK = {
  homework: { select: { dueDate: true } },
  homeworkImage: { select: { dueDate: true, title: true, position: true } },
} satisfies Prisma.HomeworkSubmissionInclude

/** What a submission is read with: its files and its task. */
const SUBMISSION_INCLUDE = { ...SUBMISSION_FILES, ...SUBMISSION_TASK } satisfies Prisma.HomeworkSubmissionInclude

/** What a picture task is called: its title, else its place among the pictures ("2-vazifa"). */
export const pictureTaskName = (image: { title: string | null; position: number }) =>
  image.title?.trim() || `${image.position + 1}-vazifa`

/** When a submission's task is due: its picture's deadline, or the written homework's. */
export function submissionDueDate(submission: {
  homework: { dueDate: Date | null }
  homeworkImage: { dueDate: Date | null } | null
}): Date | null {
  return submission.homeworkImage ? submission.homeworkImage.dueDate : submission.homework.dueDate
}

/** A homework read with what its tasks are: the instructions, and each picture's title and deadline. */
export const HOMEWORK_TASKS = {
  instructions: true,
  dueDate: true,
  images: { orderBy: { position: 'asc' }, select: { id: true, title: true, dueDate: true } },
} satisfies Prisma.HomeworkSelect

/** One thing to hand in: the written homework, or one picture task. */
export type HomeworkTask = {
  /** `WRITTEN_TASK`, or the picture's id. */
  task: string
  imageId: string | null
  /** What the task is called: the picture's title, else "2-vazifa"; null for the written homework. */
  name: string | null
  dueDate: Date | null
}

/**
 * The tasks of a homework, the written one first: the instructions are a task when there are any
 * (or when there are no pictures at all), and each picture is one -- each handed in on its own.
 */
export function homeworkTasks(homework: {
  instructions: string
  dueDate: Date | null
  images: Array<{ id: string; title: string | null; dueDate: Date | null }>
}): HomeworkTask[] {
  const written = homework.instructions.trim() !== '' || homework.images.length === 0
  return [
    ...(written ? [{ task: WRITTEN_TASK, imageId: null, name: null, dueDate: homework.dueDate }] : []),
    ...homework.images.map((image, i) => ({
      task: image.id,
      imageId: image.id,
      name: pictureTaskName({ title: image.title, position: i }),
      dueDate: image.dueDate,
    })),
  ]
}

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

/** A video already stored on Telegram -- `round` for a round video message. */
export type StoredVideo = {
  fileId: string
  fileUniqueId: string
  round: boolean
  /** Seconds. */
  duration: number
  width?: number | null
  height?: number | null
  size?: number | null
}

/** Handed in after the task's deadline -- flagged for the teacher. No deadline means it can't be late. */
export function isLateSubmission(submittedAt: Date, dueDate: Date | null): boolean {
  if (!dueDate) return false
  return submittedAt.getTime() > dueDate.getTime()
}

/**
 * The deadline has passed for this student: nothing more may be added or taken out. A submission
 * the teacher sent back to be redone stays open regardless -- they asked for it.
 */
export function isPastDeadline(dueDate: Date | null, status: HomeworkSubmissionStatus | null | undefined, now = new Date()) {
  if (status === 'RETURNED' || !dueDate) return false
  return now.getTime() >= dueDate.getTime()
}

type SubmissionWithFiles = {
  id: string
  task: string
  status: HomeworkSubmissionStatus
  submittedAt: Date
  checkedAt: Date | null
  teacherComment: string | null
  homework: { dueDate: Date | null }
  homeworkImage: { dueDate: Date | null; title: string | null; position: number } | null
  photos: Array<{ id: string; width: number | null; height: number | null }>
  voices: Array<{ id: string; duration: number }>
  videos: Array<{ id: string; duration: number; round: boolean; width: number | null; height: number | null }>
  feedbackVoice: { id: string; duration: number } | null
}

/** A submission as both apps show it -- file ids of ours only, never Telegram's. */
export function submissionView(submission: SubmissionWithFiles) {
  return {
    id: submission.id,
    task: submission.task,
    /** The picture task's name; null for the written homework. */
    taskName: submission.homeworkImage ? pictureTaskName(submission.homeworkImage) : null,
    status: submission.status,
    submittedAt: submission.submittedAt,
    checkedAt: submission.checkedAt,
    teacherComment: submission.teacherComment,
    late: isLateSubmission(submission.submittedAt, submissionDueDate(submission)),
    photos: submission.photos.map((p) => ({ id: p.id, width: p.width, height: p.height })),
    voices: submission.voices.map((v) => ({ id: v.id, duration: v.duration })),
    videos: submission.videos.map((v) => ({ id: v.id, duration: v.duration, round: v.round, width: v.width, height: v.height })),
    /** The teacher's spoken feedback, if they recorded one. */
    feedbackVoice: submission.feedbackVoice && { id: submission.feedbackVoice.id, duration: submission.feedbackVoice.duration },
  }
}

/**
 * One task of the homework of `lessonSessionId`, if `studentId` may hand it in: they were
 * enrolled in the lesson's group, the group takes submissions, and the lesson's homework has
 * that task. "Not found" for lessons that aren't the student's -- nothing to probe.
 */
export async function submittableTask(studentId: string, lessonSessionId: string, task: string) {
  const lesson = await prisma.lessonSession.findFirst({
    where: { id: lessonSessionId, group: { enrollments: { some: { studentId } } } },
    include: {
      homework: { select: { id: true, ...HOMEWORK_TASKS } },
      group: { select: { homeworkSubmissionEnabled: true } },
    },
  })
  if (!lesson?.homework) throw new NotFoundError('Homework not found')
  const target = homeworkTasks(lesson.homework).find((t) => t.task === task)
  if (!target) throw new NotFoundError('Homework task not found')
  if (!lesson.group.homeworkSubmissionEnabled) throw new ForbiddenError('SUBMISSIONS_DISABLED')
  return { lesson, homework: lesson.homework, task: target }
}

export type HomeworkFileKind = 'photo' | 'voice' | 'video'

const FILE_LIMITS: Record<HomeworkFileKind, { max: number; error: string }> = {
  photo: { max: MAX_HOMEWORK_PHOTOS, error: 'TOO_MANY_PHOTOS' },
  voice: { max: MAX_HOMEWORK_VOICES, error: 'TOO_MANY_VOICES' },
  video: { max: MAX_HOMEWORK_VIDEOS, error: 'TOO_MANY_VIDEOS' },
}

const FILE_COUNT = { _count: { select: { photos: true, voices: true, videos: true } } } as const
const COUNT_KEY = { photo: 'photos', voice: 'voices', video: 'videos' } as const

/**
 * Checks a file may still be added to a task before it is stored anywhere: the task is
 * submittable, not already checked, its deadline hasn't passed, and it has room for another
 * file of that kind.
 */
export async function assertCanAddHomeworkFile(
  studentId: string,
  lessonSessionId: string,
  task: string,
  kind: HomeworkFileKind,
  now = new Date(),
) {
  const target = await submittableTask(studentId, lessonSessionId, task)
  const submission = await prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId_task: { homeworkId: target.homework.id, studentId, task } },
    include: FILE_COUNT,
  })
  if (submission?.status === 'CHECKED') throw new ConflictError('ALREADY_CHECKED')
  if (isPastDeadline(target.task.dueDate, submission?.status, now)) throw new ConflictError('DEADLINE_PASSED')
  if ((submission?._count[COUNT_KEY[kind]] ?? 0) >= FILE_LIMITS[kind].max) throw new ConflictError(FILE_LIMITS[kind].error)
  return target
}

/**
 * The student's submission for that task, ready for one more file (created on the first one).
 * A submission sent back to be redone goes back to the teacher's queue.
 */
async function openSubmission(studentId: string, lessonSessionId: string, task: string, kind: HomeworkFileKind, now: Date) {
  const { homework, task: target } = await assertCanAddHomeworkFile(studentId, lessonSessionId, task, kind, now)
  return prisma.homeworkSubmission.upsert({
    where: { homeworkId_studentId_task: { homeworkId: homework.id, studentId, task } },
    update: { status: 'SUBMITTED', submittedAt: now, checkedAt: null },
    create: { homeworkId: homework.id, homeworkImageId: target.imageId, task, studentId, submittedAt: now },
  })
}

/** Adds one photo to the student's submission for one task of that lesson's homework. */
export async function addHomeworkPhoto(
  studentId: string,
  lessonSessionId: string,
  task: string,
  photo: StoredPhoto,
  now = new Date(),
) {
  const submission = await openSubmission(studentId, lessonSessionId, task, 'photo', now)
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

/** Adds one voice note (or audio file) to the student's submission for one task of that lesson's homework. */
export async function addHomeworkVoice(
  studentId: string,
  lessonSessionId: string,
  task: string,
  voice: StoredVoice,
  now = new Date(),
) {
  const submission = await openSubmission(studentId, lessonSessionId, task, 'voice', now)
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

/** Adds one video to the student's submission for one task of that lesson's homework. */
export async function addHomeworkVideo(
  studentId: string,
  lessonSessionId: string,
  task: string,
  video: StoredVideo,
  now = new Date(),
) {
  const submission = await openSubmission(studentId, lessonSessionId, task, 'video', now)
  await prisma.homeworkVideo.create({
    data: {
      submissionId: submission.id,
      telegramFileId: video.fileId,
      telegramFileUniqueId: video.fileUniqueId,
      round: video.round,
      duration: video.duration,
      width: video.width ?? null,
      height: video.height ?? null,
      size: video.size ?? null,
    },
  })
  return getHomeworkSubmission(submission.id)
}

/** What taking a file back out needs to know about its submission: its status, file count and deadline. */
const REMOVAL_CONTEXT = {
  submission: { include: { ...FILE_COUNT, ...SUBMISSION_TASK } },
} satisfies Prisma.HomeworkPhotoInclude & Prisma.HomeworkVoiceInclude & Prisma.HomeworkVideoInclude

type RemovableFile = {
  submissionId: string
  submission: {
    status: HomeworkSubmissionStatus
    _count: { photos: number; voices: number; videos: number }
    homework: { dueDate: Date | null }
    homeworkImage: { dueDate: Date | null } | null
  }
}

/**
 * Removes a file the student took back; the submission goes with its last file. Not once it's
 * checked, nor once the task's deadline has passed.
 */
async function removeHomeworkFile(file: RemovableFile | null, remove: () => Promise<unknown>, now = new Date()) {
  if (!file) throw new NotFoundError('File not found')
  const { submission } = file
  if (submission.status === 'CHECKED') throw new ConflictError('ALREADY_CHECKED')
  if (isPastDeadline(submissionDueDate(submission), submission.status, now)) throw new ConflictError('DEADLINE_PASSED')

  if (submission._count.photos + submission._count.voices + submission._count.videos <= 1) {
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
    include: REMOVAL_CONTEXT,
  })
  return removeHomeworkFile(photo, () => prisma.homeworkPhoto.delete({ where: { id: photoId } }))
}

/** Takes one of the student's own voice notes back out. */
export async function removeHomeworkVoice(studentId: string, voiceId: string) {
  const voice = await prisma.homeworkVoice.findFirst({
    where: { id: voiceId, submission: { studentId } },
    include: REMOVAL_CONTEXT,
  })
  return removeHomeworkFile(voice, () => prisma.homeworkVoice.delete({ where: { id: voiceId } }))
}

/** Takes one of the student's own videos back out. */
export async function removeHomeworkVideo(studentId: string, videoId: string) {
  const video = await prisma.homeworkVideo.findFirst({
    where: { id: videoId, submission: { studentId } },
    include: REMOVAL_CONTEXT,
  })
  return removeHomeworkFile(video, () => prisma.homeworkVideo.delete({ where: { id: videoId } }))
}

export function getHomeworkSubmission(id: string) {
  return prisma.homeworkSubmission.findUniqueOrThrow({
    where: { id },
    include: SUBMISSION_INCLUDE,
  })
}

/** How long "send it through the bot" in the Mini App points the bot at that task. */
export const BOT_TASK_TTL_MS = 3 * 60 * 60 * 1000

/**
 * Points the bot at one task: what the student sends the chat next goes there (for
 * `BOT_TASK_TTL_MS`) -- the Mini App's "record it in the bot" button. The task must still take
 * files.
 */
export async function setBotHomeworkTask(studentId: string, lessonSessionId: string, task: string, now = new Date()) {
  await assertCanAddHomeworkFile(studentId, lessonSessionId, task, 'voice', now).catch((err) => {
    // A full list of voice notes doesn't stop videos.
    if (!(err instanceof ConflictError && err.message === 'TOO_MANY_VOICES')) throw err
  })
  await prisma.student.update({
    where: { id: studentId },
    data: { botHomeworkTask: `${lessonSessionId}:${task}`, botHomeworkTaskAt: now },
  })
}

/** A lesson as the bot needs it to file a homework file: when and what, for the caption and receipt. */
type BotLesson = { id: string; date: Date; topic: string | null }

export type BotHomeworkTarget = { lesson: BotLesson; task: HomeworkTask; taskCount: number }

/**
 * Where a file sent straight to the bot goes: the task the student last picked in the Mini App
 * (within `BOT_TASK_TTL_MS`, while it still takes files), else the newest homework of their
 * current group with a task not yet checked -- of those tasks, the open one due soonest (one with
 * no deadline after those with one), or, when all have closed, the last to close, so the student
 * is told it's too late. Null when the group doesn't take submissions or nothing is left.
 */
export async function botHomeworkTarget(studentId: string, now = new Date()): Promise<BotHomeworkTarget | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { botHomeworkTask: true, botHomeworkTaskAt: true },
  })
  if (
    student?.botHomeworkTask &&
    student.botHomeworkTaskAt &&
    now.getTime() - student.botHomeworkTaskAt.getTime() < BOT_TASK_TTL_MS
  ) {
    const [lessonId, task] = student.botHomeworkTask.split(':')
    const picked = await submittableTask(studentId, lessonId, task).catch(() => null)
    if (picked) {
      const submission = await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_studentId_task: { homeworkId: picked.homework.id, studentId, task } },
        select: { status: true },
      })
      if (submission?.status !== 'CHECKED' && !isPastDeadline(picked.task.dueDate, submission?.status, now)) {
        const lesson = { id: picked.lesson.id, date: picked.lesson.date, topic: picked.lesson.topic }
        return { lesson, task: picked.task, taskCount: homeworkTasks(picked.homework).length }
      }
    }
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, status: 'ACTIVE', group: { homeworkSubmissionEnabled: true } },
    orderBy: { startDate: 'desc' },
  })
  if (!enrollment) return null
  const lessons = await prisma.lessonSession.findMany({
    where: { groupId: enrollment.groupId, homework: { isNot: null } },
    orderBy: { date: 'desc' },
    take: 10,
    select: {
      id: true,
      date: true,
      topic: true,
      homework: { select: { ...HOMEWORK_TASKS, submissions: { where: { studentId }, select: { task: true, status: true } } } },
    },
  })
  for (const lesson of lessons) {
    const { submissions, ...homework } = lesson.homework!
    const tasks = homeworkTasks(homework)
    const statusOf = (t: HomeworkTask) => submissions.find((s) => s.task === t.task)?.status
    const left = tasks.filter((t) => statusOf(t) !== 'CHECKED')
    if (left.length === 0) continue
    const due = (t: HomeworkTask) => t.dueDate?.getTime() ?? Infinity
    const open = left.filter((t) => !isPastDeadline(t.dueDate, statusOf(t), now)).sort((a, b) => due(a) - due(b))
    const task = open[0] ?? left.reduce((a, b) => (due(b) > due(a) ? b : a))
    return { lesson: { id: lesson.id, date: lesson.date, topic: lesson.topic }, task, taskCount: tasks.length }
  }
  return null
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

/**
 * The teacher's spoken feedback on a submission, already stored on Telegram -- replacing the one
 * recorded before, if any. It reaches the family with the next verdict.
 */
export async function setHomeworkFeedbackVoice(submissionId: string, voice: StoredVoice) {
  const data = {
    telegramFileId: voice.fileId,
    telegramFileUniqueId: voice.fileUniqueId,
    duration: voice.duration,
    size: voice.size ?? null,
  }
  // Deleted and created anew, not updated: a new id is a new address, so no app plays the old one from its cache.
  await prisma.$transaction([
    prisma.homeworkFeedbackVoice.deleteMany({ where: { submissionId } }),
    prisma.homeworkFeedbackVoice.create({ data: { submissionId, ...data } }),
  ])
  return getHomeworkSubmission(submissionId)
}

/** Takes the teacher's spoken feedback off a submission. */
export async function removeHomeworkFeedbackVoice(submissionId: string) {
  await prisma.homeworkFeedbackVoice.deleteMany({ where: { submissionId } })
  return getHomeworkSubmission(submissionId)
}
