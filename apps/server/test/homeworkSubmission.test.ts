import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { addHomeworkPhoto, addHomeworkVideo, addHomeworkVoice, homeworkClosesAt, isLateSubmission, isPastDeadline } from '@tashkurgan/domain'
import { buildApp } from '../src/app'
import type { HomeworkReviewAnnouncement } from '../src/routes/homeworkSubmissions'
import type { HomeworkFileStore } from '../src/telegram/fileStore'
import { TEST_BOT_TOKEN, createAdmin, createTeacherUser, loginAs, miniAppAuth, resetDb, seedAcademicStructure } from './helpers'

/** The smallest bytes that pass as a JPEG -- the fake store never decodes them. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)])

/** Telegram, faked: uploads are kept in memory under made-up file ids. */
function fakeFileStore() {
  const files = new Map<string, Buffer>()
  const uploads: Array<{ ownerChatId?: string; caption: string }> = []
  const store: HomeworkFileStore = {
    async upload(photo, options) {
      const fileId = `file-${files.size + 1}`
      files.set(fileId, photo)
      uploads.push(options)
      return { fileId, fileUniqueId: `u-${fileId}`, width: 800, height: 600, size: photo.length }
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

/** Voice notes and videos only come in through the bot (tested there); here they are put straight in place. */
const OGG = Buffer.from('OggS fake opus bytes')
const MP4 = Buffer.from('....ftypisom fake video bytes')

describe('isLateSubmission', () => {
  const due = new Date('2026-10-05T00:00:00Z')

  it('counts the whole due day in Tashkent as on time', () => {
    // 23:30 on 5 October in Tashkent is 18:30 UTC.
    expect(isLateSubmission(new Date('2026-10-05T18:30:00Z'), due)).toBe(false)
    // 00:30 on 6 October in Tashkent is still 5 October in UTC.
    expect(isLateSubmission(new Date('2026-10-05T19:30:00Z'), due)).toBe(true)
    expect(isLateSubmission(new Date('2026-10-09T10:00:00Z'), null)).toBe(false)
  })
})

describe('homeworkClosesAt', () => {
  it('closes at the last deadline: the due day (23:59 in Tashkent) or a later picture task', () => {
    const dueDate = new Date('2026-10-05T00:00:00Z')
    expect(homeworkClosesAt({ dueDate, images: [] })).toEqual(new Date('2026-10-05T18:59:00Z'))
    const later = new Date('2026-10-07T13:00:00Z')
    expect(homeworkClosesAt({ dueDate, images: [{ dueDate: later }, { dueDate: null }] })).toEqual(later)
    expect(homeworkClosesAt({ dueDate: null, images: [{ dueDate: null }] })).toBeNull()
  })

  it('keeps a submission sent back to be redone open past the deadline', () => {
    const closesAt = new Date('2026-10-05T18:59:00Z')
    const after = new Date('2026-10-06T08:00:00Z')
    expect(isPastDeadline(closesAt, 'SUBMITTED', after)).toBe(true)
    expect(isPastDeadline(closesAt, null, after)).toBe(true)
    expect(isPastDeadline(closesAt, 'RETURNED', after)).toBe(false)
    expect(isPastDeadline(closesAt, null, new Date('2026-10-05T18:00:00Z'))).toBe(false)
    expect(isPastDeadline(null, null, after)).toBe(false)
  })
})

describe('homework photo submissions', () => {
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

  // Due far ahead unless a test says otherwise -- a passed deadline closes the homework.
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
    })
    return { ...seeded, lesson }
  }

  const upload = (lessonId: string, body: Buffer = JPEG, chatId = 700) =>
    app.inject({
      method: 'POST',
      url: `/student/homework/${lessonId}/photos`,
      headers: { ...miniAppAuth(chatId), 'content-type': 'image/jpeg' },
      payload: body,
    })

  it('takes photos only in groups that allow it', async () => {
    const { lesson } = await seedLesson({ enabled: false })
    const res = await upload(lesson.id)
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('SUBMISSIONS_DISABLED')

    const list = await app.inject({ method: 'GET', url: '/student/homework', headers: miniAppAuth(700) })
    expect(list.json()[0]).toMatchObject({ submissionEnabled: false, submission: null })
  })

  it('stores uploads on Telegram and shows the student their own photos', async () => {
    const { lesson } = await seedLesson()
    const homeBefore = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(700) })
    expect(homeBefore.json().latestHomework).toMatchObject({ handedIn: false })

    const first = await upload(lesson.id)
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ status: 'SUBMITTED', photos: [{ width: 800, height: 600 }] })
    // Without a storage chat the photo goes to the uploader's own chat, captioned with whose it is.
    expect(uploads[0]).toMatchObject({ ownerChatId: '700', caption: expect.stringContaining('Ali K') })
    await upload(lesson.id)
    // Handed in: the home screen stops hurrying them.
    const homeAfter = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(700) })
    expect(homeAfter.json().latestHomework).toMatchObject({ handedIn: true })

    const one = await app.inject({ method: 'GET', url: `/student/homework/${lesson.id}`, headers: miniAppAuth(700) })
    expect(one.json()).toMatchObject({ submissionEnabled: true, maxPhotos: 10, submission: { status: 'SUBMITTED' } })
    expect(one.json().submission.photos).toHaveLength(2)
    // Only photo ids leave the server, never Telegram's file ids.
    expect(JSON.stringify(one.json())).not.toContain('file-')

    const photoId = one.json().submission.photos[0].id
    const image = await app.inject({ method: 'GET', url: `/student/homework-photos/${photoId}`, headers: miniAppAuth(700) })
    expect(image.statusCode).toBe(200)
    expect(image.headers['content-type']).toBe('image/jpeg')
    expect(image.rawPayload.equals(JPEG)).toBe(true)

    const removed = await app.inject({ method: 'DELETE', url: `/student/homework-photos/${photoId}`, headers: miniAppAuth(700) })
    expect(removed.json().submission.photos).toHaveLength(1)
  })

  it('plays voice notes back to the student and the teacher, and lets the student take them out', async () => {
    const { lesson, student } = await seedLesson()
    files.set('voice-1', OGG)
    await addHomeworkVoice(student.id, lesson.id, { fileId: 'voice-1', fileUniqueId: 'u-voice-1', duration: 42 })
    await upload(lesson.id)

    const one = await app.inject({ method: 'GET', url: `/student/homework/${lesson.id}`, headers: miniAppAuth(700) })
    // The newest open homework -- what the student sends the bot goes here.
    expect(one.json()).toMatchObject({ maxVoices: 10, botTarget: true, submission: { voices: [{ duration: 42 }] } })
    const voiceId = one.json().submission.voices[0].id

    const played = await app.inject({ method: 'GET', url: `/student/homework-voices/${voiceId}`, headers: miniAppAuth(700) })
    expect(played.headers['content-type']).toBe('audio/ogg')
    expect(played.rawPayload.equals(OGG)).toBe(true)

    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const roster = await app.inject({ method: 'GET', url: `/sessions/${lesson.id}/homework-submissions`, headers: { cookie } })
    expect(roster.json().students[0].submission.voices).toEqual([{ id: voiceId, duration: 42 }])
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

  it('caps voice notes per homework', async () => {
    const { lesson, student } = await seedLesson()
    for (let i = 0; i < 10; i++) {
      await addHomeworkVoice(student.id, lesson.id, { fileId: `voice-${i}`, fileUniqueId: `u-${i}`, duration: 5 })
    }
    await expect(
      addHomeworkVoice(student.id, lesson.id, { fileId: 'voice-x', fileUniqueId: 'u-x', duration: 5 }),
    ).rejects.toThrow('TOO_MANY_VOICES')
  })

  it("refuses anything but an image, and another student's photos", async () => {
    const { lesson } = await seedLesson()
    const notImage = await upload(lesson.id, Buffer.from('definitely not a picture, just text'))
    expect(notImage.statusCode).toBe(400)

    await upload(lesson.id)
    const photo = await prisma.homeworkPhoto.findFirstOrThrow()
    const other = await prisma.student.create({ data: { firstName: 'Vali', lastName: 'B', dob: new Date('2012-01-01') } })
    await prisma.telegramLink.create({ data: { chatId: '701', studentId: other.id } })
    const peek = await app.inject({ method: 'GET', url: `/student/homework-photos/${photo.id}`, headers: miniAppAuth(701) })
    expect(peek.statusCode).toBe(404)
    // Not in the lesson's group, so not their homework to hand in either.
    expect((await upload(lesson.id, JPEG, 701)).statusCode).toBe(404)
  })

  it('lets the teacher check or send back a submission, and tells the family', async () => {
    const { lesson, group, student } = await seedLesson()
    await upload(lesson.id)
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')

    const roster = await app.inject({ method: 'GET', url: `/sessions/${lesson.id}/homework-submissions`, headers: { cookie } })
    expect(roster.statusCode).toBe(200)
    const [row] = roster.json().students
    expect(row).toMatchObject({ student: { id: student.id }, submission: { status: 'SUBMITTED', late: false } })

    const sentBack = await app.inject({
      method: 'POST',
      url: `/homework-submissions/${row.submission.id}/review`,
      headers: { cookie },
      payload: { status: 'RETURNED', comment: '3-mashqni qayta ishlang' },
    })
    expect(sentBack.json()).toMatchObject({ status: 'RETURNED', teacherComment: '3-mashqni qayta ishlang' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(reviews[0]).toMatchObject({ chatIds: ['700'], review: { status: 'RETURNED', lessonId: lesson.id } })

    // A new photo puts it back in the teacher's queue.
    expect((await upload(lesson.id)).json().status).toBe('SUBMITTED')
    const unchecked = await app.inject({ method: 'GET', url: '/homework-submissions/unchecked', headers: { cookie } })
    expect(unchecked.json()).toEqual({ total: 1, byGroup: { [group.id]: 1 } })

    await app.inject({
      method: 'POST',
      url: `/homework-submissions/${row.submission.id}/review`,
      headers: { cookie },
      payload: { status: 'CHECKED' },
    })
    // Once checked, it's closed to changes.
    const late = await upload(lesson.id)
    expect(late.statusCode).toBe(409)
    expect(late.json().error).toBe('ALREADY_CHECKED')
  })

  it('closes the homework once its deadline has passed, unless the teacher sends it back', async () => {
    const { lesson, student } = await seedLesson({ dueDate: new Date('2026-09-22') })

    const detail = await app.inject({ method: 'GET', url: `/student/homework/${lesson.id}`, headers: miniAppAuth(700) })
    expect(detail.json().closesAt).toBe('2026-09-22T18:59:00.000Z')
    const refused = await upload(lesson.id)
    expect(refused.statusCode).toBe(409)
    expect(refused.json().error).toBe('DEADLINE_PASSED')
    expect(uploads).toHaveLength(0)

    // Handed in on time (the day before)...
    const onTime = await addHomeworkPhoto(student.id, lesson.id, { fileId: 'p-1', fileUniqueId: 'u-p-1' }, new Date('2026-09-21T10:00:00Z'))
    await addHomeworkPhoto(student.id, lesson.id, { fileId: 'p-2', fileUniqueId: 'u-p-2' }, new Date('2026-09-21T10:01:00Z'))
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

  it('keeps a homework open until its last picture task is due', async () => {
    const { lesson, group } = await seedLesson({ dueDate: new Date('2026-09-22') })
    const homework = await prisma.homework.findUniqueOrThrow({ where: { lessonSessionId: lesson.id } })
    await prisma.homeworkImage.create({
      data: { groupId: group.id, homeworkId: homework.id, telegramFileId: 'img', telegramFileUniqueId: 'u-img', dueDate: new Date('2099-01-01T10:00:00Z') },
    })
    expect((await upload(lesson.id)).statusCode).toBe(200)
  })

  it('plays videos back to the student and the teacher, and lets the student take them out', async () => {
    const { lesson, student } = await seedLesson()
    files.set('video-1', MP4)
    await addHomeworkVideo(student.id, lesson.id, { fileId: 'video-1', fileUniqueId: 'u-video-1', round: true, duration: 40, width: 384, height: 384 })
    await upload(lesson.id)

    const one = await app.inject({ method: 'GET', url: `/student/homework/${lesson.id}`, headers: miniAppAuth(700) })
    expect(one.json()).toMatchObject({ maxVideos: 5, submission: { videos: [{ duration: 40, round: true, width: 384 }] } })
    const videoId = one.json().submission.videos[0].id

    const played = await app.inject({ method: 'GET', url: `/student/homework-videos/${videoId}`, headers: miniAppAuth(700) })
    expect(played.headers['content-type']).toBe('video/mp4')
    expect(played.rawPayload.equals(MP4)).toBe(true)

    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const roster = await app.inject({ method: 'GET', url: `/sessions/${lesson.id}/homework-submissions`, headers: { cookie } })
    expect(roster.json().students[0].submission.videos).toEqual([{ id: videoId, duration: 40, round: true, width: 384, height: 384 }])
    expect((await app.inject({ method: 'GET', url: `/homework-videos/${videoId}`, headers: { cookie } })).statusCode).toBe(200)

    const other = await prisma.student.create({ data: { firstName: 'Vali', lastName: 'B', dob: new Date('2012-01-01') } })
    await prisma.telegramLink.create({ data: { chatId: '701', studentId: other.id } })
    const peek = await app.inject({ method: 'GET', url: `/student/homework-videos/${videoId}`, headers: miniAppAuth(701) })
    expect(peek.statusCode).toBe(404)

    const removed = await app.inject({ method: 'DELETE', url: `/student/homework-videos/${videoId}`, headers: miniAppAuth(700) })
    expect(removed.json().submission).toMatchObject({ videos: [], photos: [{}] })
  })

  it('caps videos per homework', async () => {
    const { lesson, student } = await seedLesson()
    const video = (i: number | string) => ({ fileId: `video-${i}`, fileUniqueId: `u-${i}`, round: false, duration: 30 })
    for (let i = 0; i < 5; i++) await addHomeworkVideo(student.id, lesson.id, video(i))
    await expect(addHomeworkVideo(student.id, lesson.id, video('x'))).rejects.toThrow('TOO_MANY_VIDEOS')
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
