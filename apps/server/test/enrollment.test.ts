import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { resetDb, createAdmin, loginAs } from './helpers'

describe('enrollment', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  async function seedAcademicStructure() {
    const subject = await prisma.subject.create({ data: { name: 'English' } })
    const course = await prisma.course.create({ data: { name: 'General English', subjectId: subject.id } })
    const level = await prisma.level.create({ data: { name: 'Elementary', courseId: course.id } })
    const teacherUser = await prisma.user.create({
      data: { username: 't1', role: 'TEACHER', passwordHash: 'x' },
    })
    const teacher = await prisma.teacher.create({ data: { fullName: 'T', userId: teacherUser.id } })
    const groupA = await prisma.group.create({
      data: {
        name: 'A',
        levelId: level.id,
        teacherId: teacher.id,
        scheduleDays: ['MON'],
        scheduleTime: '18:00',
        startDate: new Date(),
      },
    })
    const groupB = await prisma.group.create({
      data: {
        name: 'B',
        levelId: level.id,
        teacherId: teacher.id,
        scheduleDays: ['TUE'],
        scheduleTime: '18:00',
        startDate: new Date(),
      },
    })
    const student = await prisma.student.create({
      data: { firstName: 'Ali', lastName: 'K', dob: new Date('2012-01-01') },
    })
    return { subject, groupA, groupB, student }
  }

  it('prevents a second active enrollment in the same subject', async () => {
    const { groupA, groupB, student } = await seedAcademicStructure()
    await createAdmin()
    const cookie = await loginAs(app, 'admin', 'admin12345')

    const first = await app.inject({
      method: 'POST',
      url: `/groups/${groupA.id}/enrollments`,
      headers: { cookie },
      payload: { studentId: student.id, startDate: new Date().toISOString() },
    })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({
      method: 'POST',
      url: `/groups/${groupB.id}/enrollments`,
      headers: { cookie },
      payload: { studentId: student.id, startDate: new Date().toISOString() },
    })
    expect(second.statusCode).toBe(409)
  })

  it('changing groups ends the old enrollment and preserves history', async () => {
    const { groupA, groupB, student } = await seedAcademicStructure()
    await createAdmin()
    const cookie = await loginAs(app, 'admin', 'admin12345')

    const created = await app.inject({
      method: 'POST',
      url: `/groups/${groupA.id}/enrollments`,
      headers: { cookie },
      payload: { studentId: student.id, startDate: new Date().toISOString() },
    })
    const enrollmentId = created.json().id

    const changed = await app.inject({
      method: 'PATCH',
      url: `/enrollments/${enrollmentId}/change-group`,
      headers: { cookie },
      payload: { toGroupId: groupB.id, changeDate: new Date().toISOString() },
    })
    expect(changed.statusCode).toBe(200)

    const oldEnrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } })
    expect(oldEnrollment?.status).toBe('ENDED')
    expect(oldEnrollment?.endReason).toBe('GROUP_CHANGE')

    const enrollments = await prisma.enrollment.findMany({ where: { studentId: student.id } })
    expect(enrollments).toHaveLength(2)
    expect(enrollments.filter((e) => e.status === 'ACTIVE')).toHaveLength(1)
  })
})
