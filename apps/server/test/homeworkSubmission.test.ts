import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { isLateSubmission } from '@tashkurgan/domain'
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
    async keep(photo) {
      return photo
    },
    async download(fileId) {
      const body = files.get(fileId)
      if (!body) throw new Error('no such file')
      return { body, contentType: 'image/jpeg' }
    },
  }
  return { store, uploads }
}

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

describe('homework photo submissions', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  const { store, uploads } = fakeFileStore()
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

  async function seedLesson({ enabled = true } = {}) {
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
        homework: { create: { instructions: 'Ex. 4, page 12', dueDate: new Date('2026-09-22') } },
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

    const first = await upload(lesson.id)
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ status: 'SUBMITTED', photos: [{ width: 800, height: 600 }] })
    // Without a storage chat the photo goes to the uploader's own chat, captioned with whose it is.
    expect(uploads[0]).toMatchObject({ ownerChatId: '700', caption: expect.stringContaining('Ali K') })
    await upload(lesson.id)

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
    // Due on 22 September, handed in today -- late, but accepted.
    expect(row).toMatchObject({ student: { id: student.id }, submission: { status: 'SUBMITTED', late: true } })

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
