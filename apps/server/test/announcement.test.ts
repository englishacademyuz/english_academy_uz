import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { formatAnnouncement } from '../src/bot/format'
import type { AnnouncementBroadcast, SentMessage } from '../src/routes/announcements'
import type { HomeworkFileStore } from '../src/telegram/fileStore'
import {
  TEST_BOT_TOKEN,
  createAdmin,
  createTeacherUser,
  loginAs,
  miniAppAuth,
  resetDb,
  seedAcademicStructure,
} from './helpers'

/** The smallest bytes that pass as a JPEG -- the fake store never decodes them. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)])
const JPEG_DATA_URL = `data:image/jpeg;base64,${JPEG.toString('base64')}`

const HOUR = 60 * 60 * 1000

/** Telegram, faked: only pictures are uploaded and fetched back here. */
function fakeFileStore() {
  const files = new Map<string, Buffer>()
  const uploads: Array<{ caption: string }> = []
  const unused = async () => {
    throw new Error('not used here')
  }
  const store: HomeworkFileStore = {
    async upload(photo, options) {
      const fileId = `file-${files.size + 1}`
      files.set(fileId, photo)
      uploads.push(options)
      return { fileId, fileUniqueId: `u-${fileId}`, width: 1200, height: 800, size: photo.length }
    },
    uploadVideo: unused,
    uploadAudio: unused,
    uploadVoice: unused,
    keep: unused,
    keepVoice: unused,
    keepVideo: unused,
    async download(fileId) {
      const body = files.get(fileId)
      if (!body) throw new Error('no such file')
      return { body, contentType: 'image/jpeg' }
    },
  }
  return { store, uploads }
}

describe('the announcement message in Telegram', () => {
  const base = { title: 'Yangi doska', body: 'Sinfga <yangi> doska olamiz', eventAt: null, amount: null, authorName: 'Umid' }

  it('heads each kind its own way and escapes what staff typed', () => {
    expect(formatAnnouncement({ ...base, kind: 'NEWS' })).toContain('📰 <b>YANGILIK</b>')
    expect(formatAnnouncement({ ...base, kind: 'NEWS' })).toContain('Sinfga &lt;yangi&gt; doska olamiz')
    expect(formatAnnouncement({ ...base, kind: 'ORGANIZATIONAL', amount: 20000 })).toContain(
      '💰 Har bir oʻquvchidan: <b>20 000 soʻm</b>',
    )
  })

  it("gives an event's time in Tashkent", () => {
    // 10:00 UTC on Saturday 7 November is 15:00 in Tashkent.
    const text = formatAnnouncement({ ...base, kind: 'EVENT', eventAt: new Date('2026-11-07T10:00:00Z') })
    expect(text).toContain('🎉 <b>TADBIR</b>')
    expect(text).toContain('Shanba, 7-noyabr, soat 15:00')
  })
})

describe('announcements', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  const { store, uploads } = fakeFileStore()
  const sent: Array<{ chatIds: string[]; announcement: AnnouncementBroadcast }> = []
  const retracted: SentMessage[][] = []
  let nextMessageId = 1

  beforeAll(async () => {
    app = await buildApp({
      telegramBotToken: TEST_BOT_TOKEN,
      homeworkFileStore: store,
      announcementNotifier: {
        async send(chatIds, announcement) {
          sent.push({ chatIds, announcement })
          return chatIds.map((chatId) => ({ chatId, messageId: nextMessageId++ }))
        },
        async retract(messages) {
          retracted.push(messages)
        },
      },
    })
  })

  afterEach(async () => {
    sent.length = 0
    retracted.length = 0
    uploads.length = 0
    await resetDb()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  /** Teacher1's group A with Ali (chat 700), and teacher2's group B with Vali (chat 800). */
  async function seed() {
    const seeded = await seedAcademicStructure()
    await prisma.telegramLink.create({ data: { chatId: '700', studentId: seeded.student.id } })
    const { teacher: other } = await createTeacherUser('teacher2', 'teacher12345')
    const otherGroup = await prisma.group.create({
      data: { name: 'B', levelId: seeded.level.id, teacherId: other.id, scheduleDays: ['TUE'], scheduleTime: '18:00', startDate: new Date() },
    })
    const otherStudent = await prisma.student.create({ data: { firstName: 'Vali', lastName: 'S', dob: new Date('2012-01-01') } })
    await prisma.enrollment.create({
      data: { studentId: otherStudent.id, groupId: otherGroup.id, subjectId: seeded.subject.id, startDate: new Date() },
    })
    await prisma.telegramLink.create({ data: { chatId: '800', studentId: otherStudent.id } })
    await createAdmin()
    return {
      ...seeded,
      otherGroup,
      cookie: await loginAs(app, 'teacher1', 'teacher12345'),
      otherCookie: await loginAs(app, 'teacher2', 'teacher12345'),
      adminCookie: await loginAs(app, 'admin', 'admin12345'),
    }
  }

  const publish = (cookie: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/announcements', headers: { cookie }, payload })

  it("sends a teacher's notice with its picture to their group's chats, and shows it first in the Mini App", async () => {
    const { group, cookie } = await seed()

    const res = await publish(cookie, {
      kind: 'ORGANIZATIONAL',
      title: '  Yangi doska uchun yigʻim ',
      body: 'Sinfimizga yangi oq doska olamiz.',
      amount: 20000,
      groupIds: [group.id],
      image: JPEG_DATA_URL,
    })
    expect(res.statusCode).toBe(200)
    const announcement = res.json()
    expect(announcement).toMatchObject({
      kind: 'ORGANIZATIONAL',
      title: 'Yangi doska uchun yigʻim',
      amount: 20000,
      authorName: 'Test Teacher',
      image: { width: 1200, height: 800 },
      notifiedChats: 1,
    })
    // Telegram's file id stays on the server.
    expect(JSON.stringify(announcement)).not.toContain('file-')
    expect(uploads).toHaveLength(1)

    expect(sent).toHaveLength(1)
    expect(sent[0].chatIds).toEqual(['700'])
    expect(sent[0].announcement).toMatchObject({ id: announcement.id, imageFileId: 'file-1' })
    await vi.waitFor(async () => expect(await prisma.announcementMessage.count()).toBe(1))

    const home = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(700) })
    expect(home.json().announcements).toEqual([expect.objectContaining({ id: announcement.id, amount: 20000 })])

    const image = await app.inject({ method: 'GET', url: `/student/announcements/${announcement.id}/image`, headers: miniAppAuth(700) })
    expect(image.statusCode).toBe(200)
    expect(image.rawPayload.equals(JPEG)).toBe(true)
  })

  it("keeps it from other groups' students", async () => {
    const { group, cookie } = await seed()
    const { id } = (await publish(cookie, { kind: 'NEWS', title: 'Yangilik', body: 'Matn', groupIds: [group.id] })).json()

    const home = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(800) })
    expect(home.json().announcements).toEqual([])
    const detail = await app.inject({ method: 'GET', url: `/student/announcements/${id}`, headers: miniAppAuth(800) })
    expect(detail.statusCode).toBe(404)
  })

  it("refuses a teacher sending to another teacher's group, before uploading anything", async () => {
    const { group, otherGroup, cookie } = await seed()

    const res = await publish(cookie, {
      kind: 'NEWS',
      title: 'Yangilik',
      body: 'Matn',
      groupIds: [group.id, otherGroup.id],
      image: JPEG_DATA_URL,
    })
    expect(res.statusCode).toBe(403)
    expect(uploads).toHaveLength(0)
    expect(sent).toHaveLength(0)
    expect(await prisma.announcement.count()).toBe(0)
  })

  it('lets an admin send to every group at once, each chat once', async () => {
    const { group, otherGroup, adminCookie } = await seed()

    const res = await publish(adminCookie, { kind: 'NEWS', title: 'Bayram', body: 'Tabriklaymiz!', groupIds: [group.id, otherGroup.id] })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ authorName: 'Administratsiya', notifiedChats: 2, image: null })
    expect(sent[0].chatIds.sort()).toEqual(['700', '800'])
  })

  it('needs a date and time for an event', async () => {
    const { group, cookie } = await seed()
    const res = await publish(cookie, { kind: 'EVENT', title: 'Bayram', body: 'Matn', groupIds: [group.id] })
    expect(res.statusCode).toBe(400)
  })

  it('takes an event off the home screen once it has happened, but keeps it in the list', async () => {
    const { group, cookie } = await seed()
    const past = new Date(Date.now() - 24 * HOUR).toISOString()
    const soon = new Date(Date.now() + 48 * HOUR).toISOString()
    await publish(cookie, { kind: 'EVENT', title: 'Oʻtgan', body: 'Matn', eventAt: past, groupIds: [group.id] })
    await publish(cookie, { kind: 'EVENT', title: 'Kelayotgan', body: 'Matn', eventAt: soon, groupIds: [group.id] })

    const home = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(700) })
    expect(home.json().announcements.map((a: { title: string }) => a.title)).toEqual(['Kelayotgan'])
    const all = await app.inject({ method: 'GET', url: '/student/announcements', headers: miniAppAuth(700) })
    expect(all.json()).toHaveLength(2)
  })

  it('is deleted by its author or an admin, taking its Telegram messages back', async () => {
    const { group, cookie, otherCookie, adminCookie } = await seed()
    const first = (await publish(cookie, { kind: 'NEWS', title: 'Bir', body: 'Matn', groupIds: [group.id] })).json()
    const second = (await publish(cookie, { kind: 'NEWS', title: 'Ikki', body: 'Matn', groupIds: [group.id] })).json()
    await vi.waitFor(async () => expect(await prisma.announcementMessage.count()).toBe(2))

    // Another teacher sees neither (not their group) and can't delete them.
    expect((await app.inject({ method: 'GET', url: '/announcements', headers: { cookie: otherCookie } })).json()).toEqual([])
    const refused = await app.inject({ method: 'DELETE', url: `/announcements/${first.id}`, headers: { cookie: otherCookie } })
    expect(refused.statusCode).toBe(403)

    const listed = await app.inject({ method: 'GET', url: '/announcements', headers: { cookie } })
    expect(listed.json()[0]).toMatchObject({ id: second.id, canDelete: true, sentMessages: 1, groups: [{ id: group.id, name: 'A' }] })

    expect((await app.inject({ method: 'DELETE', url: `/announcements/${first.id}`, headers: { cookie } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'DELETE', url: `/announcements/${second.id}`, headers: { cookie: adminCookie } })).statusCode).toBe(200)
    await vi.waitFor(() => expect(retracted).toHaveLength(2))
    expect(retracted.flat().map((m) => m.chatId)).toEqual(['700', '700'])

    const home = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(700) })
    expect(home.json().announcements).toEqual([])
  })
})
