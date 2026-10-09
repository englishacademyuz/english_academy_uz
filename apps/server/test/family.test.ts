import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { groupRecipients, studentChatIds } from '@tashkurgan/domain'
import { buildApp } from '../src/app'
import { formatQuizAnnouncement } from '../src/bot/format'
import { TEST_BOT_TOKEN, createAdmin, loginAs, miniAppAuth, resetDb, seedAcademicStructure } from './helpers'

describe('families (siblings sharing a phone)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp({ telegramBotToken: TEST_BOT_TOKEN })
  })

  afterEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  /** Ali (seeded, in group A) and his sister Vali in the same group; a parent's phone linked through Ali's code. */
  async function setup() {
    const seeded = await seedAcademicStructure()
    const vali = await prisma.student.create({ data: { firstName: 'Vali', lastName: 'K', dob: new Date('2014-01-01') } })
    await prisma.enrollment.create({
      data: { studentId: vali.id, groupId: seeded.group.id, subjectId: seeded.subject.id, startDate: new Date(), status: 'ACTIVE' },
    })
    await prisma.telegramLink.create({ data: { chatId: '800', studentId: seeded.student.id } })
    await createAdmin()
    const cookie = await loginAs(app, 'admin', 'admin12345')
    const tie = (id: string, studentId: string) =>
      app.inject({ method: 'POST', url: `/students/${id}/family`, headers: { cookie }, payload: { studentId } })
    return { ...seeded, ali: seeded.student, vali, cookie, tie }
  }

  it('lets an admin tie siblings together and untie them', async () => {
    const { ali, vali, cookie, tie } = await setup()
    const sara = await prisma.student.create({ data: { firstName: 'Sara', lastName: 'K', dob: new Date('2016-01-01') } })

    const tied = await tie(ali.id, vali.id)
    expect(tied.statusCode).toBe(200)
    expect(tied.json().students.map((s: { firstName: string }) => s.firstName)).toEqual(['Ali', 'Vali'])
    // A third child joins the same family, from either side.
    await tie(sara.id, vali.id)
    const family = await app.inject({ method: 'GET', url: `/students/${ali.id}/family`, headers: { cookie } })
    expect(family.json().students.map((s: { firstName: string }) => s.firstName)).toEqual(['Ali', 'Sara', 'Vali'])
    expect(await prisma.family.count()).toBe(1)
    expect((await tie(ali.id, ali.id)).statusCode).toBe(400)

    await app.inject({ method: 'DELETE', url: `/students/${sara.id}/family`, headers: { cookie } })
    expect((await prisma.student.findUniqueOrThrow({ where: { id: sara.id } })).familyId).toBeNull()
    // Down to one child: nothing left to share.
    await app.inject({ method: 'DELETE', url: `/students/${vali.id}/family`, headers: { cookie } })
    expect((await prisma.student.findUniqueOrThrow({ where: { id: ali.id } })).familyId).toBeNull()
    expect(await prisma.family.count()).toBe(0)
  })

  it('keeps teachers from tying students', async () => {
    const { ali, vali } = await setup()
    const teacherCookie = await loginAs(app, 'teacher1', 'teacher12345')
    const res = await app.inject({
      method: 'POST',
      url: `/students/${ali.id}/family`,
      headers: { cookie: teacherCookie },
      payload: { studentId: vali.id },
    })
    expect(res.statusCode).toBe(403)
  })

  it("opens any tied sibling from one phone in the Mini App, and nobody else's account", async () => {
    const { ali, vali, tie } = await setup()
    const alone = await app.inject({ method: 'GET', url: '/student/accounts', headers: miniAppAuth(800) })
    expect(alone.json().accounts).toHaveLength(1)

    await tie(ali.id, vali.id)
    const accounts = await app.inject({ method: 'GET', url: '/student/accounts', headers: miniAppAuth(800) })
    expect(accounts.json()).toMatchObject({
      current: ali.id,
      accounts: [
        { id: ali.id, firstName: 'Ali', group: { name: 'A' } },
        { id: vali.id, firstName: 'Vali', group: { name: 'A' } },
      ],
    })

    const asVali = await app.inject({ method: 'GET', url: '/student/home', headers: { ...miniAppAuth(800), 'x-student-id': vali.id } })
    expect(asVali.json().student.firstName).toBe('Vali')

    const stranger = await prisma.student.create({ data: { firstName: 'Zed', lastName: 'Z', dob: new Date('2012-01-01') } })
    const peek = await app.inject({ method: 'GET', url: '/student/home', headers: { ...miniAppAuth(800), 'x-student-id': stranger.id } })
    expect(peek.statusCode).toBe(403)
    expect(peek.json().error).toBe('ACCOUNT_UNAVAILABLE')

    // Choosing an account in the app points the bot at them too.
    await app.inject({ method: 'POST', url: `/student/accounts/${vali.id}/choose`, headers: miniAppAuth(800) })
    expect((await prisma.telegramLink.findUniqueOrThrow({ where: { chatId: '800' } })).studentId).toBe(vali.id)
    const refused = await app.inject({ method: 'POST', url: `/student/accounts/${stranger.id}/choose`, headers: miniAppAuth(800) })
    expect(refused.statusCode).toBe(404)
  })

  it("sends each sibling's news to all of the family's phones, with their name", async () => {
    const { group, subject, ali, vali, tie } = await setup()
    // The other parent linked through Vali's code; a classmate has a phone of their own.
    await prisma.telegramLink.create({ data: { chatId: '801', studentId: vali.id } })
    const classmate = await prisma.student.create({ data: { firstName: 'Bek', lastName: 'B', dob: new Date('2012-01-01') } })
    await prisma.enrollment.create({
      data: { studentId: classmate.id, groupId: group.id, subjectId: subject.id, startDate: new Date(), status: 'ACTIVE' },
    })
    await prisma.telegramLink.create({ data: { chatId: '802', studentId: classmate.id } })

    expect((await studentChatIds(ali.id)).sort()).toEqual(['800'])
    await tie(ali.id, vali.id)
    expect((await studentChatIds(ali.id)).sort()).toEqual(['800', '801'])
    expect((await studentChatIds(vali.id)).sort()).toEqual(['800', '801'])

    // A group-wide message reaches each phone once, naming every child of theirs it's about.
    expect(await groupRecipients(group.id)).toEqual([
      { chatId: '800', studentNames: ['Ali K', 'Vali K'] },
      { chatId: '801', studentNames: ['Ali K', 'Vali K'] },
      { chatId: '802', studentNames: ['Bek B'] },
    ])
    const text = formatQuizAnnouncement({ title: 'Test', questionCount: 3, maxPoints: 9, deadline: new Date(), studentNames: ['Ali K', 'Vali K'] })
    expect(text).toContain('Oʻquvchilar: <b>Ali K, Vali K</b>')
  })

  it('keeps the other children on the phone when a sibling is deleted', async () => {
    const { ali, vali, cookie, tie } = await setup()
    await tie(ali.id, vali.id)
    const res = await app.inject({ method: 'DELETE', url: `/students/${ali.id}`, headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect((await prisma.telegramLink.findUniqueOrThrow({ where: { chatId: '800' } })).studentId).toBe(vali.id)
    expect(await prisma.family.count()).toBe(0)
  })
})
