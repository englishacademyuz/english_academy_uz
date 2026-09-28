import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { LEVEL_PALETTE, pickLevelColor } from '@tashkurgan/domain'
import { buildApp } from '../src/app'
import type { LessonChangeAnnouncement } from '../src/routes/schedule'
import { createAdmin, createTeacherUser, loginAs, resetDb, seedAcademicStructure } from './helpers'

// seedAcademicStructure's group meets on Mondays; 2030-01-07 is a Monday.
const MONDAY = '2030-01-07'
const THURSDAY = '2030-01-10'
const NEXT_MONDAY = '2030-01-14'

describe('lesson schedule, group edit/delete, level colors', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  const announcements: Array<{ chatIds: string[]; change: LessonChangeAnnouncement }> = []

  beforeAll(async () => {
    app = await buildApp({
      lessonChangeNotifier: async (chatIds, change) => {
        announcements.push({ chatIds, change })
      },
    })
  })

  afterEach(async () => {
    announcements.length = 0
    await resetDb()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  async function setup() {
    const seeded = await seedAcademicStructure()
    await prisma.telegramLink.create({ data: { chatId: '555', studentId: seeded.student.id } })
    const teacherCookie = await loginAs(app, 'teacher1', 'teacher12345')
    await createAdmin()
    const adminCookie = await loginAs(app, 'admin', 'admin12345')
    return { ...seeded, teacherCookie, adminCookie }
  }

  it("lets the group's teacher move a lesson to another day and tells the students", async () => {
    const { group, teacherCookie } = await setup()

    const res = await app.inject({
      method: 'PUT',
      url: `/groups/${group.id}/reschedules`,
      headers: { cookie: teacherCookie },
      payload: { originalDate: MONDAY, newDate: THURSDAY, newTime: '15:00', reason: 'Bayram', notify: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().notifiedChats).toBe(1)
    expect(res.json().notifiedAt).not.toBeNull()
    expect(announcements).toHaveLength(1)
    expect(announcements[0].chatIds).toEqual(['555'])
    expect(announcements[0].change).toMatchObject({ kind: 'moved', newTime: '15:00', regularTime: '18:00', reason: 'Bayram' })

    const listed = await app.inject({
      method: 'GET',
      url: `/reschedules?from=${MONDAY}&to=${NEXT_MONDAY}`,
      headers: { cookie: teacherCookie },
    })
    expect(listed.json()).toHaveLength(1)
  })

  it('moving the same lesson again updates it instead of stacking a second move', async () => {
    const { group, teacherCookie } = await setup()
    const move = (newDate: string) =>
      app.inject({
        method: 'PUT',
        url: `/groups/${group.id}/reschedules`,
        headers: { cookie: teacherCookie },
        payload: { originalDate: MONDAY, newDate, newTime: '18:00' },
      })
    expect((await move(THURSDAY)).statusCode).toBe(200)
    expect((await move('2030-01-12')).statusCode).toBe(200)
    expect(await prisma.lessonReschedule.count()).toBe(1)
    expect(announcements).toHaveLength(0)
  })

  it('refuses a day that is not a regular lesson, or a target day that already has one', async () => {
    const { group, teacherCookie } = await setup()
    const notALessonDay = await app.inject({
      method: 'PUT',
      url: `/groups/${group.id}/reschedules`,
      headers: { cookie: teacherCookie },
      payload: { originalDate: THURSDAY, newDate: '2030-01-11', newTime: '18:00' },
    })
    expect(notALessonDay.statusCode).toBe(400)

    const onAnotherLesson = await app.inject({
      method: 'PUT',
      url: `/groups/${group.id}/reschedules`,
      headers: { cookie: teacherCookie },
      payload: { originalDate: MONDAY, newDate: NEXT_MONDAY, newTime: '18:00' },
    })
    expect(onAnotherLesson.statusCode).toBe(409)
  })

  it("a teacher can't move another teacher's lesson", async () => {
    const { group } = await setup()
    await createTeacherUser('teacher2', 'teacher12345')
    const other = await loginAs(app, 'teacher2', 'teacher12345')
    const res = await app.inject({
      method: 'PUT',
      url: `/groups/${group.id}/reschedules`,
      headers: { cookie: other },
      payload: { originalDate: MONDAY, newDate: THURSDAY, newTime: '18:00' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('undoing an announced move tells the students it is back on the regular day', async () => {
    const { group, teacherCookie } = await setup()
    const created = await app.inject({
      method: 'PUT',
      url: `/groups/${group.id}/reschedules`,
      headers: { cookie: teacherCookie },
      payload: { originalDate: MONDAY, newDate: THURSDAY, newTime: '18:00', notify: true },
    })
    const res = await app.inject({ method: 'DELETE', url: `/reschedules/${created.json().id}`, headers: { cookie: teacherCookie } })
    expect(res.statusCode).toBe(200)
    expect(announcements.map((a) => a.change.kind)).toEqual(['moved', 'restored'])
    expect(await prisma.lessonReschedule.count()).toBe(0)
  })

  it('admin can edit a group; a teacher cannot', async () => {
    const { group, adminCookie, teacherCookie } = await setup()
    const payload = { name: 'Fixed name', scheduleDays: ['TUE', 'THU'], scheduleTime: '16:30' }

    const denied = await app.inject({ method: 'PATCH', url: `/groups/${group.id}`, headers: { cookie: teacherCookie }, payload })
    expect(denied.statusCode).toBe(403)

    const res = await app.inject({ method: 'PATCH', url: `/groups/${group.id}`, headers: { cookie: adminCookie }, payload })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject(payload)
  })

  it('deleting a group archives it: history stays, the future and its students are released', async () => {
    const { group, student, teacher, adminCookie } = await setup()
    const past = await prisma.lessonSession.create({
      data: { groupId: group.id, teacherId: teacher.id, date: new Date('2020-01-06'), topic: 'Past' },
    })
    await prisma.attendance.create({ data: { lessonSessionId: past.id, studentId: student.id, status: 'PRESENT' } })
    await prisma.lessonSession.create({ data: { groupId: group.id, teacherId: teacher.id, date: new Date(MONDAY), topic: 'Planned' } })
    await prisma.lessonReschedule.create({
      data: { groupId: group.id, originalDate: new Date(NEXT_MONDAY), newDate: new Date('2030-01-15'), newTime: '18:00' },
    })

    const res = await app.inject({ method: 'DELETE', url: `/groups/${group.id}`, headers: { cookie: adminCookie } })
    expect(res.statusCode).toBe(200)

    const list = await app.inject({ method: 'GET', url: '/groups', headers: { cookie: adminCookie } })
    expect(list.json()).toHaveLength(0)

    const sessions = await prisma.lessonSession.findMany({ where: { groupId: group.id } })
    expect(sessions.map((s) => s.topic)).toEqual(['Past'])
    expect(await prisma.attendance.count()).toBe(1)
    expect(await prisma.lessonReschedule.count()).toBe(0)
    expect((await prisma.enrollment.findFirstOrThrow()).status).toBe('ENDED')

    const reenroll = await app.inject({
      method: 'POST',
      url: `/groups/${group.id}/enrollments`,
      headers: { cookie: adminCookie },
      payload: { studentId: student.id, startDate: MONDAY },
    })
    expect(reenroll.statusCode).toBe(409)
  })

  it('students list carries the current group, rating points and attendance', async () => {
    const { group, student, teacher, adminCookie } = await setup()
    const session = await prisma.lessonSession.create({ data: { groupId: group.id, teacherId: teacher.id, date: new Date('2020-01-06') } })
    await prisma.attendance.create({ data: { lessonSessionId: session.id, studentId: student.id, status: 'ABSENT' } })
    await prisma.pointTransaction.create({ data: { studentId: student.id, groupId: group.id, activityType: 'OTHER', points: 7 } })

    const res = await app.inject({ method: 'GET', url: '/students', headers: { cookie: adminCookie } })
    const [row] = res.json()
    expect(row.groups).toEqual([{ id: group.id, name: group.name, level: { name: 'Elementary', color: '#6366f1' } }])
    expect(row.points).toBe(7)
    expect(row.attendance.totals.ABSENT).toBe(1)
    expect(row.attendance.rate).toBe(0)
  })

  it('new levels get a color no other level has', async () => {
    const { course, adminCookie } = await setup()
    const res = await app.inject({
      method: 'POST',
      url: `/courses/${course.id}/levels`,
      headers: { cookie: adminCookie },
      payload: { name: 'Advanced' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().color).toMatch(/^#[0-9a-f]{6}$/)
    expect(res.json().color).not.toBe('#6366f1')
  })

  it('pickLevelColor generates a fresh color once the palette is used up', () => {
    const color = pickLevelColor(LEVEL_PALETTE)
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
    expect(LEVEL_PALETTE).not.toContain(color)
  })
})
