import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { formatStaffMessage } from '../src/bot/format'
import type { StaffMessageAnnouncement } from '../src/routes/conversations'
import { TEST_BOT_TOKEN, createAdmin, createTeacherUser, loginAs, miniAppAuth, resetDb, seedAcademicStructure } from './helpers'

describe('family chat (Oʻqituvchi bilan muloqot)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  const delivered: Array<{ chatIds: string[]; message: StaffMessageAnnouncement }> = []

  beforeAll(async () => {
    app = await buildApp({
      telegramBotToken: TEST_BOT_TOKEN,
      chatNotifier: async (chatIds, message) => {
        delivered.push({ chatIds, message })
      },
    })
  })

  afterEach(async () => {
    delivered.length = 0
    await resetDb()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  async function setup() {
    const seeded = await seedAcademicStructure()
    // The student's own chat and a parent's.
    await prisma.telegramLink.createMany({
      data: [
        { chatId: '901', studentId: seeded.student.id },
        { chatId: '902', studentId: seeded.student.id },
      ],
    })
    const teacher = await loginAs(app, 'teacher1', 'teacher12345')
    const familyWrites = (chatId: number, text: string) =>
      app.inject({ method: 'POST', url: '/student/chat/messages', headers: miniAppAuth(chatId), payload: { text } })
    return { ...seeded, teacher, familyWrites }
  }

  it('shows a parent’s question to the group’s teacher, unread until opened', async () => {
    const { student, teacher, familyWrites } = await setup()
    const sent = await familyWrites(902, 'Assalomu alaykum, Ali bugun kasal.')
    expect(sent.statusCode).toBe(200)
    expect(sent.json()).toMatchObject({ mine: true, senderName: 'Test' })

    const summary = await app.inject({ method: 'GET', url: '/conversations/unread', headers: { cookie: teacher } })
    expect(summary.json()).toMatchObject({
      conversations: 1,
      messages: 1,
      latest: { studentId: student.id, studentName: 'Ali K', text: 'Assalomu alaykum, Ali bugun kasal.' },
    })

    const list = await app.inject({ method: 'GET', url: '/conversations', headers: { cookie: teacher } })
    expect(list.json()).toHaveLength(1)
    expect(list.json()[0]).toMatchObject({ studentId: student.id, unread: 1, student: { groups: [{ name: 'A' }] } })

    const thread = await app.inject({ method: 'GET', url: `/students/${student.id}/conversation`, headers: { cookie: teacher } })
    expect(thread.json()).toMatchObject({ linkedChats: 2, messages: [{ sender: 'FAMILY', senderName: 'Test' }] })

    const after = await app.inject({ method: 'GET', url: '/conversations/unread', headers: { cookie: teacher } })
    expect(after.json()).toMatchObject({ conversations: 0, messages: 0, latest: null })
  })

  it('delivers the teacher’s answer to every linked chat and to the Mini App', async () => {
    const { student, teacher, familyWrites } = await setup()
    await familyWrites(902, 'Uyga vazifa nima edi?')

    const reply = await app.inject({
      method: 'POST',
      url: `/students/${student.id}/conversation/messages`,
      headers: { cookie: teacher },
      payload: { text: '  12-mashq, 40-bet.  ' },
    })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ sender: 'STAFF', senderName: 'Test Teacher', text: '12-mashq, 40-bet.', deliveredChats: 2 })
    expect(delivered).toHaveLength(1)
    expect(delivered[0].chatIds.sort()).toEqual(['901', '902'])
    expect(delivered[0].message).toMatchObject({ studentName: 'Ali K', senderName: 'Test Teacher' })

    // The student's own chat sees the answer as unread on the home screen until it opens the chat.
    const home = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(901) })
    expect(home.json().unreadChat).toBe(1)

    const chat = await app.inject({ method: 'GET', url: '/student/chat', headers: miniAppAuth(901) })
    expect(chat.json().teacher).toMatchObject({ name: 'Test Teacher' })
    // Chat 901 didn't write the question, so it isn't flagged as its own.
    expect(chat.json().messages.map((m: { fromFamily: boolean; mine: boolean }) => [m.fromFamily, m.mine])).toEqual([
      [true, false],
      [false, false],
    ])

    const homeAfter = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(901) })
    expect(homeAfter.json().unreadChat).toBe(0)
    const thread = await app.inject({ method: 'GET', url: `/students/${student.id}/conversation`, headers: { cookie: teacher } })
    expect(thread.json().familyReadAt).not.toBeNull()
  })

  it('keeps each teacher to their own students, while an admin sees every chat', async () => {
    const { student, familyWrites } = await setup()
    await familyWrites(902, 'Savol bor edi')

    await createTeacherUser('teacher2', 'teacher12345')
    const other = await loginAs(app, 'teacher2', 'teacher12345')
    const list = await app.inject({ method: 'GET', url: '/conversations', headers: { cookie: other } })
    expect(list.json()).toEqual([])
    const thread = await app.inject({ method: 'GET', url: `/students/${student.id}/conversation`, headers: { cookie: other } })
    expect(thread.statusCode).toBe(403)
    const reply = await app.inject({
      method: 'POST',
      url: `/students/${student.id}/conversation/messages`,
      headers: { cookie: other },
      payload: { text: 'Salom' },
    })
    expect(reply.statusCode).toBe(403)

    await createAdmin()
    const admin = await loginAs(app, 'admin', 'admin12345')
    const adminList = await app.inject({ method: 'GET', url: '/conversations', headers: { cookie: admin } })
    expect(adminList.json()).toHaveLength(1)
    // Reads are per staff member: the admin opening it doesn't clear the teacher's badge.
    await app.inject({ method: 'GET', url: `/students/${student.id}/conversation`, headers: { cookie: admin } })
    const teacher = await loginAs(app, 'teacher1', 'teacher12345')
    const summary = await app.inject({ method: 'GET', url: '/conversations/unread', headers: { cookie: teacher } })
    expect(summary.json().messages).toBe(1)
  })

  it('refuses an empty message and a student with no linked Telegram', async () => {
    const { student, teacher } = await setup()
    const empty = await app.inject({
      method: 'POST',
      url: `/students/${student.id}/conversation/messages`,
      headers: { cookie: teacher },
      payload: { text: '   ' },
    })
    expect(empty.statusCode).toBe(400)

    await prisma.telegramLink.deleteMany({ where: { studentId: student.id } })
    const unlinked = await app.inject({
      method: 'POST',
      url: `/students/${student.id}/conversation/messages`,
      headers: { cookie: teacher },
      payload: { text: 'Salom' },
    })
    expect(unlinked.statusCode).toBe(400)
    expect(delivered).toHaveLength(0)
  })
})

describe('formatStaffMessage', () => {
  it('names the teacher and the student and escapes the text', () => {
    const text = formatStaffMessage({ studentName: 'Ali K', senderName: 'Umid', text: '2 < 3 & ok' })
    expect(text).toContain('Oʻqituvchidan xabar')
    expect(text).toContain('Umid')
    expect(text).toContain('2 &lt; 3 &amp; ok')
  })
})
