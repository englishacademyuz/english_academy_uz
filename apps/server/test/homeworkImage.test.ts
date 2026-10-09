import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import type { HomeworkFileStore } from '../src/telegram/fileStore'
import { TEST_BOT_TOKEN, createTeacherUser, loginAs, miniAppAuth, resetDb, seedAcademicStructure } from './helpers'

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
      return { fileId, fileUniqueId: `u-${fileId}`, width: 1200, height: 900, size: photo.length }
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
      return { body, contentType: 'image/jpeg' }
    },
  }
  return { store, uploads }
}

describe('homework images from the teacher', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  const { store, uploads } = fakeFileStore()

  beforeAll(async () => {
    app = await buildApp({ telegramBotToken: TEST_BOT_TOKEN, homeworkFileStore: store })
  })

  afterEach(async () => {
    uploads.length = 0
    await resetDb()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  async function seed() {
    const seeded = await seedAcademicStructure()
    await prisma.telegramLink.create({ data: { chatId: '700', studentId: seeded.student.id } })
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    return { ...seeded, cookie }
  }

  const uploadImage = (groupId: string, cookie: string) =>
    app.inject({
      method: 'POST',
      url: `/groups/${groupId}/homework-images`,
      headers: { cookie, 'content-type': 'image/jpeg' },
      payload: JPEG,
    })

  const saveLesson = (groupId: string, cookie: string, homework: unknown) =>
    app.inject({
      method: 'POST',
      url: `/groups/${groupId}/sessions`,
      headers: { cookie },
      payload: { date: '2026-10-05', topic: 'Past Simple', homework },
    })

  it('attaches uploaded pictures with titles, captions and deadlines (day and time), in order, when the lesson is saved', async () => {
    const { group, cookie } = await seed()
    const first = await uploadImage(group.id, cookie)
    const second = await uploadImage(group.id, cookie)
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ width: 1200, height: 900, caption: null })
    // Teachers have no chat with the bot -- the picture goes to the storage chat, named by group.
    expect(uploads[0]).toEqual({ caption: expect.stringContaining(group.name) })

    const saved = await saveLesson(group.id, cookie, {
      instructions: '<p>Look at the pictures</p>',
      images: [
        { id: second.json().id, title: ' Listening ', caption: '  Page 12  ', dueDate: '2026-10-07T13:00:00.000Z' },
        { id: first.json().id, title: '', caption: '', dueDate: null },
      ],
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().homework.images).toEqual([
      {
        id: second.json().id,
        title: 'Listening',
        caption: 'Page 12',
        dueDate: '2026-10-07T13:00:00.000Z',
        width: 1200,
        height: 900,
      },
      { id: first.json().id, title: null, caption: null, dueDate: null, width: 1200, height: 900 },
    ])

    // Re-saving with one left removes the other.
    const resaved = await saveLesson(group.id, cookie, {
      instructions: '<p>Look at the pictures</p>',
      images: [{ id: first.json().id, caption: 'Only this one' }],
    })
    expect(resaved.json().homework.images).toEqual([expect.objectContaining({ id: first.json().id, caption: 'Only this one' })])
    expect(await prisma.homeworkImage.count()).toBe(1)

    const bytes = await app.inject({ method: 'GET', url: `/homework-images/${first.json().id}`, headers: { cookie } })
    expect(bytes.statusCode).toBe(200)
    expect(bytes.rawPayload.equals(JPEG)).toBe(true)
  })

  it('takes homework that is only pictures, but not empty homework', async () => {
    const { group, cookie } = await seed()
    const image = await uploadImage(group.id, cookie)

    const onlyPictures = await saveLesson(group.id, cookie, { instructions: '', images: [{ id: image.json().id }] })
    expect(onlyPictures.statusCode).toBe(200)
    expect(onlyPictures.json().homework).toMatchObject({ instructions: '', images: [{ id: image.json().id }] })

    const empty = await saveLesson(group.id, cookie, { instructions: '  ', images: [] })
    expect(empty.statusCode).toBe(400)
  })

  it("ignores a picture uploaded for another group and hides it from other teachers", async () => {
    const { group, level, cookie } = await seed()
    const { teacher: other } = await createTeacherUser('teacher2', 'teacher12345')
    const otherGroup = await prisma.group.create({
      data: { name: 'B', levelId: level.id, teacherId: other.id, scheduleDays: ['TUE'], scheduleTime: '18:00', startDate: new Date() },
    })
    const otherCookie = await loginAs(app, 'teacher2', 'teacher12345')
    const foreign = await uploadImage(otherGroup.id, otherCookie)

    // Uploading to someone else's group is refused outright.
    expect((await uploadImage(otherGroup.id, cookie)).statusCode).toBe(403)

    const saved = await saveLesson(group.id, cookie, { instructions: '<p>Hi</p>', images: [{ id: foreign.json().id }] })
    expect(saved.json().homework.images).toEqual([])

    const peek = await app.inject({ method: 'GET', url: `/homework-images/${foreign.json().id}`, headers: { cookie } })
    expect(peek.statusCode).toBe(403)
  })

  it('shows the pictures to the group’s students in the Mini App', async () => {
    const { group, cookie } = await seed()
    const image = await uploadImage(group.id, cookie)
    const unsaved = await uploadImage(group.id, cookie)
    const saved = await saveLesson(group.id, cookie, { instructions: '', images: [{ id: image.json().id, caption: 'Worksheet' }] })
    const lessonId = saved.json().id

    const lesson = await app.inject({ method: 'GET', url: `/student/lessons/${lessonId}`, headers: miniAppAuth(700) })
    expect(lesson.json().homework.images).toEqual([
      { id: image.json().id, title: null, caption: 'Worksheet', dueDate: null, width: 1200, height: 900 },
    ])
    // Only picture ids leave the server, never Telegram's file ids.
    expect(JSON.stringify(lesson.json())).not.toContain('file-')

    const list = await app.inject({ method: 'GET', url: '/student/homework', headers: miniAppAuth(700) })
    expect(list.json()[0].images).toHaveLength(1)
    const home = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(700) })
    expect(home.json().latestHomework.images).toHaveLength(1)

    const bytes = await app.inject({ method: 'GET', url: `/student/homework-images/${image.json().id}`, headers: miniAppAuth(700) })
    expect(bytes.statusCode).toBe(200)
    expect(bytes.rawPayload.equals(JPEG)).toBe(true)

    // A picture not yet given out, or a stranger asking, gets nothing.
    const draft = await app.inject({ method: 'GET', url: `/student/homework-images/${unsaved.json().id}`, headers: miniAppAuth(700) })
    expect(draft.statusCode).toBe(404)
    const stranger = await prisma.student.create({ data: { firstName: 'Vali', lastName: 'B', dob: new Date('2012-01-01') } })
    await prisma.telegramLink.create({ data: { chatId: '800', studentId: stranger.id } })
    const strange = await app.inject({ method: 'GET', url: `/student/homework-images/${image.json().id}`, headers: miniAppAuth(800) })
    expect(strange.statusCode).toBe(404)
  })
})

describe('homework image limits', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp({ telegramBotToken: TEST_BOT_TOKEN, homeworkFileStore: fakeFileStore().store })
  })

  afterEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await app.close()
  })

  it('takes at most five pictures per homework', async () => {
    const { group } = await seedAcademicStructure()
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const ids: string[] = []
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/groups/${group.id}/homework-images`,
        headers: { cookie, 'content-type': 'image/jpeg' },
        payload: JPEG,
      })
      ids.push(res.json().id)
    }
    const save = (images: string[]) =>
      app.inject({
        method: 'POST',
        url: `/groups/${group.id}/sessions`,
        headers: { cookie },
        payload: { date: '2026-10-05', homework: { instructions: '', images: images.map((id) => ({ id })) } },
      })
    expect((await save(ids)).statusCode).toBe(400)
    expect((await save(ids.slice(0, 5))).json().homework.images).toHaveLength(5)
  })
})
