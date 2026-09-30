import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { formatAbsenceNotice } from '../src/bot/format'
import type { AbsenceAnnouncement } from '../src/routes/absences'
import { createTeacherUser, loginAs, resetDb, seedAcademicStructure } from './helpers'

describe('absence notices', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  const sent: Array<{ chatIds: string[]; absence: AbsenceAnnouncement }> = []

  beforeAll(async () => {
    app = await buildApp({
      absenceNotifier: async (chatIds, absence) => {
        sent.push({ chatIds, absence })
      },
    })
  })

  afterEach(async () => {
    sent.length = 0
    await resetDb()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  async function setup() {
    const seeded = await seedAcademicStructure()
    await prisma.telegramLink.create({ data: { chatId: '777', studentId: seeded.student.id } })
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const mark = (date: string, status: 'PRESENT' | 'ABSENT') =>
      app.inject({
        method: 'POST',
        url: `/groups/${seeded.group.id}/sessions`,
        headers: { cookie },
        payload: { date, attendance: [{ studentId: seeded.student.id, status }] },
      })
    const listed = async () => {
      const list = await app.inject({ method: 'GET', url: '/students', headers: { cookie } })
      return list.json().find((s: { id: string }) => s.id === seeded.student.id)
    }
    return { ...seeded, cookie, mark, listed }
  }

  it('shows a missed latest lesson on the list and tells the student’s chats', async () => {
    const { cookie, mark, listed } = await setup()
    await mark('2026-09-28', 'ABSENT')

    const absence = (await listed()).lastAbsence
    expect(absence).toMatchObject({ date: '2026-09-28T00:00:00.000Z', groupName: 'A', notifiedAt: null })

    const res = await app.inject({ method: 'POST', url: `/attendances/${absence.attendanceId}/absence-notice`, headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json().notifiedChats).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0].chatIds).toEqual(['777'])
    expect(sent[0].absence).toMatchObject({ studentName: 'Ali K', groupName: 'A' })
    expect((await listed()).lastAbsence.notifiedAt).not.toBeNull()
  })

  it('goes away once the student comes to a later lesson', async () => {
    const { mark, listed } = await setup()
    await mark('2026-09-28', 'ABSENT')
    await mark('2026-09-30', 'PRESENT')
    expect((await listed()).lastAbsence).toBeNull()
  })

  it('refuses a present student and another group’s teacher', async () => {
    const { mark, listed } = await setup()
    await mark('2026-09-28', 'ABSENT')
    const { attendanceId } = (await listed()).lastAbsence

    await createTeacherUser('teacher2', 'teacher12345')
    const other = await loginAs(app, 'teacher2', 'teacher12345')
    const forbidden = await app.inject({ method: 'POST', url: `/attendances/${attendanceId}/absence-notice`, headers: { cookie: other } })
    expect(forbidden.statusCode).toBe(403)

    await prisma.attendance.update({ where: { id: attendanceId }, data: { status: 'PRESENT' } })
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const present = await app.inject({ method: 'POST', url: `/attendances/${attendanceId}/absence-notice`, headers: { cookie } })
    expect(present.statusCode).toBe(400)
    expect(sent).toHaveLength(0)
  })
})

describe('formatAbsenceNotice', () => {
  it('names the student, the group and the day', () => {
    const text = formatAbsenceNotice({ studentName: 'Ali <K>', groupName: 'A', date: new Date('2026-09-28T00:00:00Z') })
    expect(text).toContain('darsga kelmadi')
    expect(text).toContain('Ali &lt;K&gt;')
    expect(text).toContain('28-sentabr')
  })
})
