import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import {
  addHomeworkPhoto,
  addHomeworkVideo,
  addHomeworkVoice,
  botHomeworkTarget,
  homeworkTasks,
  isLateSubmission,
  isPastDeadline,
} from '@tashkurgan/domain'
import { buildApp } from '../src/app'
import type { HomeworkReviewAnnouncement } from '../src/routes/homeworkSubmissions'
import type { HomeworkFileStore } from '../src/telegram/fileStore'
import { TEST_BOT_TOKEN, createAdmin, createTeacherUser, loginAs, miniAppAuth, resetDb, seedAcademicStructure } from './helpers'

/** The smallest bytes that pass as a JPEG -- the fake store never decodes them. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)])

/** Telegram, faked: uploads are kept in memory under made-up file ids. */
function fakeFileStore() {
  const files = new Map<string, Buffer>()
  const uploads: Array<{ ownerChatId?: string; caption: string; fileName?: string }> = []
  const keepUpload = (prefix: string, body: Buffer, options: { ownerChatId?: string; caption: string; fileName?: string }) => {
    const fileId = `${prefix}-up-${files.size + 1}`
    files.set(fileId, body)
    uploads.push(options)
    return fileId
  }
  const store: HomeworkFileStore = {
    async upload(photo, options) {
      const fileId = keepUpload('file', photo, options)
      return { fileId, fileUniqueId: `u-${fileId}`, width: 800, height: 600, size: photo.length }
    },
    async uploadVideo(video, options) {
      const fileId = keepUpload('video', video, options)
      return { fileId, fileUniqueId: `u-${fileId}`, round: false, duration: 12, width: 720, height: 1280, size: video.length }
    },
    async uploadAudio(audio, options) {
      const fileId = keepUpload('voice', audio, options)
      return { fileId, fileUniqueId: `u-${fileId}`, duration: 33, size: audio.length }
    },
    async keepVideo(video) {
      return video
    },
    async keepVoice(voice) {
      return voice
    },
    async keep(photo) {
      return photo
    },
    async download(fileId) {
      const body = files.get(fileId)
      if (!body) throw new Error('no such file')
      const contentType = fileId.startsWith('voice-') ? 'audio/ogg' : fileId.startsWith('video-') ? 'video/mp4' : 'image/jpeg'
      return { body, contentType }
    },
  }
  return { store, uploads, files }
}

/** Voice notes and videos sent to the bot are tested there; here they are put straight in place. */
const OGG = Buffer.from('OggS fake opus bytes')
const MP4 = Buffer.from('....ftypisom fake video bytes')

describe('isLateSubmission', () => {
  const due = new Date('2026-10-05T17:00:00Z')

  it('is late only after the deadline moment', () => {
    expect(isLateSubmission(new Date('2026-10-05T16:59:00Z'), due)).toBe(false)
    expect(isLateSubmission(new Date('2026-10-05T17:01:00Z'), due)).toBe(true)
    expect(isLateSubmission(new Date('2026-10-09T10:00:00Z'), null)).toBe(false)
  })
})

describe('isPastDeadline', () => {
  it('keeps a submission sent back to be redone open past the deadline', () => {
    const due = new Date('2026-10-05T18:59:00Z')
    const after = new Date('2026-10-06T08:00:00Z')
    expect(isPastDeadline(due, 'SUBMITTED', after)).toBe(true)
    expect(isPastDeadline(due, null, after)).toBe(true)
    expect(isPastDeadline(due, 'RETURNED', after)).toBe(false)
    expect(isPastDeadline(due, null, new Date('2026-10-05T18:00:00Z'))).toBe(false)
    expect(isPastDeadline(null, null, after)).toBe(false)
  })
})

describe('homeworkTasks', () => {
  const due = new Date('2026-10-05T13:00:00Z')

  it('makes the written homework one task and each picture another, named by title or place', () => {
    const tasks = homeworkTasks({
      instructions: '<p>Ex. 4</p>',
      dueDate: due,
      images: [
        { id: 'a', title: 'Listening', dueDate: null },
        { id: 'b', title: null, dueDate: due },
      ],
    })
    expect(tasks.map((t) => [t.task, t.name])).toEqual([
      ['written', null],
      ['a', 'Listening'],
      ['b', '2-vazifa'],
    ])
  })

  it('has no written task when the homework is only pictures', () => {
    expect(homeworkTasks({ instructions: '', dueDate: null, images: [{ id: 'a', title: null, dueDate: null }] })).toHaveLength(1)
    expect(homeworkTasks({ instructions: '', dueDate: null, images: [] })).toHaveLength(1)
  })
})

describe('homework submissions', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  const { store, uploads, files } = fakeFileStore()
  const reviews: Array<{ chatIds: string[]; review: HomeworkReviewAnnouncement }> = []

  beforeAll(async () => {
    app = await buildApp({
      telegramBotToken: TEST_BOT_TOKEN,
      homeworkFileStore: store,
      homeworkReviewNotifier: async (chatIds, review) => {
        reviews.push({ chatIds, review })
      },
    })
  })

  afterEach(async () => {
    reviews.length = 0
    uploads.length = 0
    await resetDb()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  // Due far ahead unless a test says otherwise -- a passed deadline closes the task.
  async function seedLesson({ enabled = true, dueDate = new Date('2099-12-31') }: { enabled?: boolean; dueDate?: Date | null } = {}) {
    const seeded = await seedAcademicStructure()
    await prisma.group.update({ where: { id: seeded.group.id }, data: { homeworkSubmissionEnabled: enabled } })
    await prisma.enrollment.updateMany({ data: { startDate: new Date('2026-09-01') } })
    await prisma.telegramLink.create({ data: { chatId: '700', studentId: seeded.student.id } })
    const lesson = await prisma.lessonSession.create({
      data: {
        groupId: seeded.group.id,
        teacherId: seeded.group.teacherId,
        date: new Date('2026-09-20'),
        topic: 'Present Simple',
        homework: { create: { instructions: 'Ex. 4, page 12', dueDate } },
      },
      include: { homework: true },
    })
    return { ...seeded, lesson }
  }

  /** A picture task on the lesson's homework. */
  async function addPictureTask(groupId: string, homeworkId: string, data: { title?: string; dueDate?: Date | null; position?: number } = {}) {
    return prisma.homeworkImage.create({
      data: {
        groupId,
        homeworkId,
        telegramFileId: 'img',
        telegramFileUniqueId: `u-img-${data.position ?? 0}`,
        title: data.title ?? null,
        dueDate: data.dueDate ?? null,
        position: data.position ?? 0,
      },
    })
  }

  const upload = (lessonId: string, { task = 'written', body = JPEG, chatId = 700 }: { task?: string; body?: Buffer; chatId?: number } = {}) =>
    app.inject({
      method: 'POST',
      url: `/student/homework/${lessonId}/tasks/${task}/photos`,
      headers: { ...miniAppAuth(chatId), 'content-type': 'image/jpeg' },
      payload: body,
    })

  const detail = (lessonId: string) => app.inject({ method: 'GET', url: `/student/homework/${lessonId}`, headers: miniAppAuth(700) })

  it('takes photos only in groups that allow it', async () => {
    const { lesson } = await seedLesson({ enabled: false })
    const res = await upload(lesson.id)
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('SUBMISSIONS_DISABLED')

    const list = await app.inject({ method: 'GET', url: '/student/homework', headers: miniAppAuth(700) })
    expect(list.json()[0]).toMatchObject({ submissionEnabled: false, tasks: [{ task: 'written', submission: null }] })
  })

  it('stores uploads on Telegram and shows the student their own photos', async () => {
    const { lesson } = await seedLesson()
    const homeBefore = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(700) })
    expect(homeBefore.json().latestHomework).toMatchObject({ handedIn: [] })

    const first = await upload(lesson.id)
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ task: 'written', taskName: null, status: 'SUBMITTED', photos: [{ width: 800, height: 600 }] })
    // Without a storage chat the photo goes to the uploader's own chat, captioned with whose it is.
    expect(uploads[0]).toMatchObject({ ownerChatId: '700', caption: expect.stringContaining('Ali K') })
    await upload(lesson.id)
    // Handed in: the home screen stops hurrying them for that task.
    const homeAfter = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(700) })
    expect(homeAfter.json().latestHomework).toMatchObject({ handedIn: ['written'] })

    const one = await detail(lesson.id)
    expect(one.json()).toMatchObject({ submissionEnabled: true, maxPhotos: 10, tasks: [{ task: 'written', submission: { status: 'SUBMITTED' } }] })
    expect(one.json().tasks[0].submission.photos).toHaveLength(2)
    // Only photo ids leave the server, never Telegram's file ids.
    expect(JSON.stringify(one.json())).not.toContain('file-')

    const photoId = one.json().tasks[0].submission.photos[0].id
    const image = await app.inject({ method: 'GET', url: `/student/homework-photos/${photoId}`, headers: miniAppAuth(700) })
    expect(image.statusCode).toBe(200)
    expect(image.headers['content-type']).toBe('image/jpeg')
    expect(image.rawPayload.equals(JPEG)).toBe(true)

    const removed = await app.inject({ method: 'DELETE', url: `/student/homework-photos/${photoId}`, headers: miniAppAuth(700) })
    expect(removed.json().submission.photos).toHaveLength(1)
  })

  it('hands in each picture task on its own, under its own deadline', async () => {
    const { lesson, group } = await seedLesson({ dueDate: new Date('2099-01-01T10:00:00Z') })
    const today = await addPictureTask(group.id, lesson.homework!.id, { title: 'Listening', dueDate: new Date('2026-09-21T17:00:00Z'), position: 0 })
    const tomorrow = await addPictureTask(group.id, lesson.homework!.id, { dueDate: new Date('2099-01-02T17:00:00Z'), position: 1 })

    const tasks = (await detail(lesson.id)).json().tasks
    expect(tasks.map((t: { task: string; name: string | null }) => [t.task, t.name])).toEqual([
      ['written', null],
      [today.id, 'Listening'],
      [tomorrow.id, '2-vazifa'],
    ])

    // The first picture's deadline has passed: only that task is closed.
    const closed = await upload(lesson.id, { task: today.id })
    expect(closed.statusCode).toBe(409)
    expect(closed.json().error).toBe('DEADLINE_PASSED')
    const second = await upload(lesson.id, { task: tomorrow.id })
    expect(second.json()).toMatchObject({ task: tomorrow.id, taskName: '2-vazifa', status: 'SUBMITTED' })
    expect(uploads.at(-1)?.caption).toContain('2-vazifa')
    expect((await upload(lesson.id)).json()).toMatchObject({ task: 'written' })

    // Two submissions, one per task -- the teacher sees them apart.
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const roster = await app.inject({ method: 'GET', url: `/sessions/${lesson.id}/homework-submissions`, headers: { cookie } })
    expect(roster.json().tasks.map((t: { task: string }) => t.task)).toEqual(['written', today.id, tomorrow.id])
    expect(roster.json().students[0].submissions.map((s: { task: string }) => s.task).sort()).toEqual([tomorrow.id, 'written'].sort())

    // A task that doesn't belong to this homework isn't one to hand in.
    expect((await upload(lesson.id, { task: 'nope' })).statusCode).toBe(404)
  })

  it('takes videos and audio recordings picked in the Mini App', async () => {
    const { lesson } = await seedLesson()
    const video = await app.inject({
      method: 'POST',
      url: `/student/homework/${lesson.id}/tasks/written/videos`,
      headers: { ...miniAppAuth(700), 'content-type': 'video/quicktime' },
      payload: MP4,
    })
    expect(video.statusCode).toBe(200)
    expect(video.json().videos).toEqual([expect.objectContaining({ duration: 12, round: false })])
    expect(uploads[0]).toMatchObject({ fileName: 'homework.mov' })

    const audio = await app.inject({
      method: 'POST',
      url: `/student/homework/${lesson.id}/tasks/written/audios`,
      headers: { ...miniAppAuth(700), 'content-type': 'audio/x-m4a' },
      payload: OGG,
    })
    expect(audio.json()).toMatchObject({ voices: [{ duration: 33 }], videos: [{ duration: 12 }] })

    const wrong = await app.inject({
      method: 'POST',
      url: `/student/homework/${lesson.id}/tasks/written/videos`,
      headers: { ...miniAppAuth(700), 'content-type': 'audio/mpeg' },
      payload: OGG,
    })
    expect(wrong.statusCode).toBe(400)
  })

  it('points the bot at the task the student picked, else at the open one due soonest', async () => {
    const { lesson, group, student } = await seedLesson({ dueDate: new Date('2099-03-01T10:00:00Z') })
    const soon = await addPictureTask(group.id, lesson.homework!.id, { dueDate: new Date('2099-01-01T10:00:00Z'), position: 0 })

    expect((await botHomeworkTarget(student.id))?.task.task).toBe(soon.id)
    expect((await detail(lesson.id)).json().tasks.map((t: { botTarget: boolean }) => t.botTarget)).toEqual([false, true])

    const pick = await app.inject({ method: 'POST', url: `/student/homework/${lesson.id}/tasks/written/bot`, headers: miniAppAuth(700) })
    expect(pick.statusCode).toBe(200)
    expect((await botHomeworkTarget(student.id))?.task.task).toBe('written')
    // The pick wears off after a while.
    expect((await botHomeworkTarget(student.id, new Date(Date.now() + 4 * 3_600_000)))?.task.task).toBe(soon.id)
  })

  it('plays voice notes back to the student and the teacher, and lets the student take them out', async () => {
    const { lesson, student } = await seedLesson()
    files.set('voice-1', OGG)
    await addHomeworkVoice(student.id, lesson.id, 'written', { fileId: 'voice-1', fileUniqueId: 'u-voice-1', duration: 42 })
    await upload(lesson.id)

    const one = await detail(lesson.id)
    // The only open task -- what the student sends the bot goes here.
    expect(one.json()).toMatchObject({ maxVoices: 10, tasks: [{ botTarget: true, submission: { voices: [{ duration: 42 }] } }] })
    const voiceId = one.json().tasks[0].submission.voices[0].id

    const played = await app.inject({ method: 'GET', url: `/student/homework-voices/${voiceId}`, headers: miniAppAuth(700) })
    expect(played.headers['content-type']).toBe('audio/ogg')
    expect(played.rawPayload.equals(OGG)).toBe(true)

    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const roster = await app.inject({ method: 'GET', url: `/sessions/${lesson.id}/homework-submissions`, headers: { cookie } })
    expect(roster.json().students[0].submissions[0].voices).toEqual([{ id: voiceId, duration: 42 }])
    const teacherPlay = await app.inject({ method: 'GET', url: `/homework-voices/${voiceId}`, headers: { cookie } })
    expect(teacherPlay.statusCode).toBe(200)

    const other = await prisma.student.create({ data: { firstName: 'Vali', lastName: 'B', dob: new Date('2012-01-01') } })
    await prisma.telegramLink.create({ data: { chatId: '701', studentId: other.id } })
    const peek = await app.inject({ method: 'GET', url: `/student/homework-voices/${voiceId}`, headers: miniAppAuth(701) })
    expect(peek.statusCode).toBe(404)

    // Taking the voice note out leaves the photo -- the submission stays.
    const removed = await app.inject({ method: 'DELETE', url: `/student/homework-voices/${voiceId}`, headers: miniAppAuth(700) })
    expect(removed.json().submission).toMatchObject({ voices: [], photos: [{}] })
    // ...and taking out the last file removes it.
    const photoId = removed.json().submission.photos[0].id
    const emptied = await app.inject({ method: 'DELETE', url: `/student/homework-photos/${photoId}`, headers: miniAppAuth(700) })
    expect(emptied.json().submission).toBeNull()
  })

  it('caps voice notes per task', async () => {
    const { lesson, student } = await seedLesson()
    for (let i = 0; i < 10; i++) {
      await addHomeworkVoice(student.id, lesson.id, 'written', { fileId: `voice-${i}`, fileUniqueId: `u-${i}`, duration: 5 })
    }
    await expect(
      addHomeworkVoice(student.id, lesson.id, 'written', { fileId: 'voice-x', fileUniqueId: 'u-x', duration: 5 }),
    ).rejects.toThrow('TOO_MANY_VOICES')
  })

  it("refuses anything but an image, and another student's photos", async () => {
    const { lesson } = await seedLesson()
    const notImage = await upload(lesson.id, { body: Buffer.from('definitely not a picture, just text') })
    expect(notImage.statusCode).toBe(400)

    await upload(lesson.id)
    const photo = await prisma.homeworkPhoto.findFirstOrThrow()
    const other = await prisma.student.create({ data: { firstName: 'Vali', lastName: 'B', dob: new Date('2012-01-01') } })
    await prisma.telegramLink.create({ data: { chatId: '701', studentId: other.id } })
    const peek = await app.inject({ method: 'GET', url: `/student/homework-photos/${photo.id}`, headers: miniAppAuth(701) })
    expect(peek.statusCode).toBe(404)
    // Not in the lesson's group, so not their homework to hand in either.
    expect((await upload(lesson.id, { chatId: 701 })).statusCode).toBe(404)
  })

  it('lets the teacher check or send back a submission, and tells the family', async () => {
    const { lesson, group, student } = await seedLesson()
    await upload(lesson.id)
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')

    const roster = await app.inject({ method: 'GET', url: `/sessions/${lesson.id}/homework-submissions`, headers: { cookie } })
    expect(roster.statusCode).toBe(200)
    const [row] = roster.json().students
    expect(row).toMatchObject({ student: { id: student.id }, submissions: [{ status: 'SUBMITTED', late: false }] })
    const submission = row.submissions[0]

    const sentBack = await app.inject({
      method: 'POST',
      url: `/homework-submissions/${submission.id}/review`,
      headers: { cookie },
      payload: { status: 'RETURNED', comment: '3-mashqni qayta ishlang' },
    })
    expect(sentBack.json()).toMatchObject({ status: 'RETURNED', teacherComment: '3-mashqni qayta ishlang' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(reviews[0]).toMatchObject({ chatIds: ['700'], review: { status: 'RETURNED', lessonId: lesson.id, taskName: null } })

    // A new photo puts it back in the teacher's queue.
    expect((await upload(lesson.id)).json().status).toBe('SUBMITTED')
    const unchecked = await app.inject({ method: 'GET', url: '/homework-submissions/unchecked', headers: { cookie } })
    expect(unchecked.json()).toEqual({ total: 1, byGroup: { [group.id]: 1 } })

    await app.inject({
      method: 'POST',
      url: `/homework-submissions/${submission.id}/review`,
      headers: { cookie },
      payload: { status: 'CHECKED' },
    })
    // Once checked, it's closed to changes.
    const late = await upload(lesson.id)
    expect(late.statusCode).toBe(409)
    expect(late.json().error).toBe('ALREADY_CHECKED')
  })

  it('closes a task once its deadline has passed, unless the teacher sends it back', async () => {
    const { lesson, student } = await seedLesson({ dueDate: new Date('2026-09-22T17:00:00Z') })

    const one = await detail(lesson.id)
    expect(one.json().tasks[0].dueDate).toBe('2026-09-22T17:00:00.000Z')
    const refused = await upload(lesson.id)
    expect(refused.statusCode).toBe(409)
    expect(refused.json().error).toBe('DEADLINE_PASSED')
    expect(uploads).toHaveLength(0)

    // Handed in on time (the day before)...
    const onTime = await addHomeworkPhoto(student.id, lesson.id, 'written', { fileId: 'p-1', fileUniqueId: 'u-p-1' }, new Date('2026-09-21T10:00:00Z'))
    await addHomeworkPhoto(student.id, lesson.id, 'written', { fileId: 'p-2', fileUniqueId: 'u-p-2' }, new Date('2026-09-21T10:01:00Z'))
    // ...but can't be taken back out once it's over.
    const remove = await app.inject({ method: 'DELETE', url: `/student/homework-photos/${onTime.photos[0].id}`, headers: miniAppAuth(700) })
    expect(remove.statusCode).toBe(409)
    expect(remove.json().error).toBe('DEADLINE_PASSED')

    // Sent back to be redone: open again, and the fix is late.
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    await app.inject({ method: 'POST', url: `/homework-submissions/${onTime.id}/review`, headers: { cookie }, payload: { status: 'RETURNED' } })
    const redone = await upload(lesson.id)
    expect(redone.statusCode).toBe(200)
    expect(redone.json()).toMatchObject({ status: 'SUBMITTED', late: true })
  })

  it('plays videos back to the student and the teacher, and lets the student take them out', async () => {
    const { lesson, student } = await seedLesson()
    files.set('video-1', MP4)
    await addHomeworkVideo(student.id, lesson.id, 'written', { fileId: 'video-1', fileUniqueId: 'u-video-1', round: true, duration: 40, width: 384, height: 384 })
    await upload(lesson.id)

    const one = await detail(lesson.id)
    expect(one.json()).toMatchObject({ maxVideos: 5, tasks: [{ submission: { videos: [{ duration: 40, round: true, width: 384 }] } }] })
    const videoId = one.json().tasks[0].submission.videos[0].id

    const played = await app.inject({ method: 'GET', url: `/student/homework-videos/${videoId}`, headers: miniAppAuth(700) })
    expect(played.headers['content-type']).toBe('video/mp4')
    expect(played.rawPayload.equals(MP4)).toBe(true)

    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const roster = await app.inject({ method: 'GET', url: `/sessions/${lesson.id}/homework-submissions`, headers: { cookie } })
    expect(roster.json().students[0].submissions[0].videos).toEqual([{ id: videoId, duration: 40, round: true, width: 384, height: 384 }])
    expect((await app.inject({ method: 'GET', url: `/homework-videos/${videoId}`, headers: { cookie } })).statusCode).toBe(200)

    const other = await prisma.student.create({ data: { firstName: 'Vali', lastName: 'B', dob: new Date('2012-01-01') } })
    await prisma.telegramLink.create({ data: { chatId: '701', studentId: other.id } })
    const peek = await app.inject({ method: 'GET', url: `/student/homework-videos/${videoId}`, headers: miniAppAuth(701) })
    expect(peek.statusCode).toBe(404)

    const removed = await app.inject({ method: 'DELETE', url: `/student/homework-videos/${videoId}`, headers: miniAppAuth(700) })
    expect(removed.json().submission).toMatchObject({ videos: [], photos: [{}] })
  })

  it('caps videos per task', async () => {
    const { lesson, student } = await seedLesson()
    const video = (i: number | string) => ({ fileId: `video-${i}`, fileUniqueId: `u-${i}`, round: false, duration: 30 })
    for (let i = 0; i < 5; i++) await addHomeworkVideo(student.id, lesson.id, 'written', video(i))
    await expect(addHomeworkVideo(student.id, lesson.id, 'written', video('x'))).rejects.toThrow('TOO_MANY_VIDEOS')
  })

  it('lists the group feed by topic and date, and keeps other teachers out', async () => {
    const { lesson, group } = await seedLesson()
    const older = await prisma.lessonSession.create({
      data: {
        groupId: group.id,
        teacherId: group.teacherId,
        date: new Date('2026-09-13'),
        topic: 'Articles',
        homework: { create: { instructions: 'Workbook' } },
      },
    })
    await upload(lesson.id)
    await upload(older.id)
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')

    const all = await app.inject({ method: 'GET', url: `/groups/${group.id}/homework-submissions`, headers: { cookie } })
    expect(all.json().items).toHaveLength(2)
    expect(all.json().uncheckedCount).toBe(2)

    const byTopic = await app.inject({ method: 'GET', url: `/groups/${group.id}/homework-submissions?q=artic`, headers: { cookie } })
    expect(byTopic.json().items.map((i: { lesson: { topic: string } }) => i.lesson.topic)).toEqual(['Articles'])

    const future = await app.inject({
      method: 'GET',
      url: `/groups/${group.id}/homework-submissions?from=${new Date(Date.now() + 86_400_000).toISOString()}`,
      headers: { cookie },
    })
    expect(future.json().items).toHaveLength(0)

    await createTeacherUser('teacher2', 'teacher12345')
    const otherCookie = await loginAs(app, 'teacher2', 'teacher12345')
    const forbidden = await app.inject({ method: 'GET', url: `/groups/${group.id}/homework-submissions`, headers: { cookie: otherCookie } })
    expect(forbidden.statusCode).toBe(403)
    const photo = await prisma.homeworkPhoto.findFirstOrThrow()
    const photoForbidden = await app.inject({ method: 'GET', url: `/homework-photos/${photo.id}`, headers: { cookie: otherCookie } })
    expect(photoForbidden.statusCode).toBe(403)

    await createAdmin()
    const admin = await loginAs(app, 'admin', 'admin12345')
    const photoRes = await app.inject({ method: 'GET', url: `/homework-photos/${photo.id}`, headers: { cookie: admin } })
    expect(photoRes.statusCode).toBe(200)
  })

  it('lets an admin turn photo submissions on for a group', async () => {
    const { group } = await seedLesson({ enabled: false })
    await createAdmin()
    const cookie = await loginAs(app, 'admin', 'admin12345')
    const res = await app.inject({
      method: 'PATCH',
      url: `/groups/${group.id}`,
      headers: { cookie },
      payload: { homeworkSubmissionEnabled: true },
    })
    expect(res.json().homeworkSubmissionEnabled).toBe(true)
  })
})
