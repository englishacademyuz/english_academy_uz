import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { signTelegramInitData, verifyTelegramInitData } from '../src/telegram/initData'
import { TEST_BOT_TOKEN, miniAppAuth, resetDb, seedAcademicStructure } from './helpers'

describe('verifyTelegramInitData', () => {
  const now = new Date('2026-09-28T10:00:00Z')
  const fields = {
    auth_date: String(Math.floor(now.getTime() / 1000)),
    user: JSON.stringify({ id: 42, first_name: 'Ali' }),
  }

  it('accepts data signed with the bot token', () => {
    const verified = verifyTelegramInitData(signTelegramInitData(fields, TEST_BOT_TOKEN), TEST_BOT_TOKEN, now)
    expect(verified?.user.id).toBe(42)
  })

  it('rejects a changed user id, a different bot token, a missing hash, and stale data', () => {
    const signed = new URLSearchParams(signTelegramInitData(fields, TEST_BOT_TOKEN))
    signed.set('user', JSON.stringify({ id: 43, first_name: 'Ali' }))
    expect(verifyTelegramInitData(signed.toString(), TEST_BOT_TOKEN, now)).toBeNull()

    expect(verifyTelegramInitData(signTelegramInitData(fields, 'other:token'), TEST_BOT_TOKEN, now)).toBeNull()
    expect(verifyTelegramInitData(new URLSearchParams(fields).toString(), TEST_BOT_TOKEN, now)).toBeNull()

    const twoDaysLater = new Date(now.getTime() + 2 * 24 * 3600 * 1000)
    expect(verifyTelegramInitData(signTelegramInitData(fields, TEST_BOT_TOKEN), TEST_BOT_TOKEN, twoDaysLater)).toBeNull()
  })
})

describe('mini app API', () => {
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

  it('refuses requests without valid Telegram init data', async () => {
    const none = await app.inject({ method: 'GET', url: '/student/home' })
    expect(none.statusCode).toBe(401)

    const forged = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(900, { botToken: 'x:y' }) })
    expect(forged.statusCode).toBe(401)

    // initDataUnsafe-style claims (a bare user id) are not accepted either.
    const unsigned = await app.inject({
      method: 'GET',
      url: '/student/home',
      headers: { authorization: `tma user=${encodeURIComponent('{"id":900}')}&auth_date=1` },
    })
    expect(unsigned.statusCode).toBe(401)
  })

  it('tells a valid but unlinked Telegram account to link first', async () => {
    const res = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(901) })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('NOT_LINKED')
  })

  it("serves only the linked student's own data", async () => {
    const { group, student } = await seedAcademicStructure()
    await prisma.telegramLink.create({ data: { chatId: '902', studentId: student.id } })
    // Lessons count only from the enrollment's start; seed data starts "now".
    await prisma.enrollment.updateMany({ where: { studentId: student.id }, data: { startDate: new Date('2026-09-01') } })
    const lesson = await prisma.lessonSession.create({
      data: {
        groupId: group.id,
        teacherId: group.teacherId,
        date: new Date('2026-09-10'),
        topic: 'To be',
        notes: '<p>Qoida: <strong>am, is, are</strong></p>',
        materials: { create: [{ type: 'VIDEO', content: 'https://youtu.be/abc' }] },
        homework: { create: { instructions: '20 ta lugʻat yodlash' } },
        attendances: { create: [{ studentId: student.id, status: 'PRESENT' }] },
      },
    })

    const home = (await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(902) })).json()
    expect(home.student).toEqual({ firstName: 'Ali', lastName: 'K' })
    expect(home.group).toMatchObject({ name: 'A', level: 'Elementary', teacher: 'Test Teacher' })
    expect(home.latestHomework).toMatchObject({ instructions: '20 ta lugʻat yodlash' })

    const detail = await app.inject({ method: 'GET', url: `/student/lessons/${lesson.id}`, headers: miniAppAuth(902) })
    expect(detail.json()).toMatchObject({
      topic: 'To be',
      notes: '<p>Qoida: <strong>am, is, are</strong></p>',
      materials: [{ type: 'VIDEO' }],
    })

    const attendance = (
      await app.inject({ method: 'GET', url: '/student/attendance?year=2026&month=9', headers: miniAppAuth(902) })
    ).json()
    expect(attendance).toMatchObject({ rate: 100, days: [{ lessonId: lesson.id, status: 'PRESENT' }] })

    // Another linked student can't read this lesson by guessing its id.
    const other = await prisma.student.create({ data: { firstName: 'Vali', lastName: 'B', dob: new Date('2012-01-01') } })
    await prisma.telegramLink.create({ data: { chatId: '903', studentId: other.id } })
    const probe = await app.inject({ method: 'GET', url: `/student/lessons/${lesson.id}`, headers: miniAppAuth(903) })
    expect(probe.statusCode).toBe(404)
  })

  it("places the student among their group by the points earned there, ties sharing a place", async () => {
    const { group, subject, student } = await seedAcademicStructure()
    await prisma.telegramLink.create({ data: { chatId: '906', studentId: student.id } })
    const classmate = async (firstName: string, lastName: string) => {
      const s = await prisma.student.create({ data: { firstName, lastName, dob: new Date('2012-01-01') } })
      await prisma.enrollment.create({
        data: { studentId: s.id, groupId: group.id, subjectId: subject.id, startDate: new Date(), status: 'ACTIVE' },
      })
      return s
    }
    const vali = await classmate('Vali', 'Botirov')
    const sardor = await classmate('Sardor', 'Toshev')
    await classmate('Zafar', 'Qodirov')
    const award = (studentId: string, points: number) =>
      prisma.pointTransaction.create({ data: { studentId, groupId: group.id, activityType: 'OTHER', points } })
    await award(student.id, 7.5)
    await award(student.id, 2.5)
    await award(vali.id, 10)
    await award(sardor.id, 8)

    const { groupRanking } = (await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth(906) })).json()
    expect(groupRanking).toEqual({
      myPlace: 1,
      myPoints: 10,
      rows: [
        { name: 'Ali K.', points: 10, place: 1, isMe: true },
        { name: 'Vali B.', points: 10, place: 1, isMe: false },
        { name: 'Sardor T.', points: 8, place: 2, isMe: false },
        { name: 'Zafar Q.', points: 0, place: 3, isMe: false },
      ],
    })
  })

  it('summarises the academic year month by month, newest first', async () => {
    const { group, student } = await seedAcademicStructure()
    await prisma.telegramLink.create({ data: { chatId: '905', studentId: student.id } })
    const now = new Date()
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    await prisma.lessonSession.create({
      data: {
        groupId: group.id,
        teacherId: group.teacherId,
        date: thisMonth,
        attendances: { create: [{ studentId: student.id, status: 'LATE' }] },
      },
    })

    const { months } = (await app.inject({ method: 'GET', url: '/student/attendance/year', headers: miniAppAuth(905) })).json()
    expect(months[0]).toEqual({
      year: thisMonth.getUTCFullYear(),
      month: thisMonth.getUTCMonth() + 1,
      lessons: 1,
      attended: 1,
      attendanceRate: 100,
      markAverage: null,
    })
    // Every month back to 1 September is listed, even ones without lessons.
    expect(months.at(-1).month).toBe(9)
    expect(months).toHaveLength(((now.getUTCMonth() - 8 + 12) % 12) + 1)
  })

  it('reports missing data as null, not as 0%', async () => {
    const { student } = await seedAcademicStructure()
    await prisma.telegramLink.create({ data: { chatId: '904', studentId: student.id } })

    const progress = (await app.inject({ method: 'GET', url: '/student/progress?kind=month', headers: miniAppAuth(904) })).json()
    expect(progress.attendanceRate).toBeNull()
    expect(progress.quizAverage).toBeNull()
    expect(progress.marks).toEqual([])
    expect(progress).not.toHaveProperty('homeworkRate')
  })
})
