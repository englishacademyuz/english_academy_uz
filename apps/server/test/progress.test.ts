import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { resetDb, createAdmin, loginAs, seedAcademicStructure } from './helpers'

describe('progress', () => {
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

  it('composes attendance, homework, and per-category assessment averages for the current month', async () => {
    const { level, group, student, teacher } = await seedAcademicStructure()
    await createAdmin()
    const cookie = await loginAs(app, 'admin', 'admin12345')

    const today = new Date()

    const session1 = await prisma.lessonSession.create({
      data: { groupId: group.id, teacherId: teacher.id, date: today, topic: 'Unit 1' },
    })
    await prisma.attendance.create({
      data: { lessonSessionId: session1.id, studentId: student.id, status: 'PRESENT' },
    })
    const homework = await prisma.homework.create({
      data: { lessonSessionId: session1.id, instructions: 'Unit 1 exercises' },
    })
    await prisma.homeworkResult.create({
      data: { homeworkId: homework.id, studentId: student.id, status: 'COMPLETED', score: 80 },
    })

    // A few hours earlier the same day -- distinct from session1 for the
    // (group, date) unique constraint, but still safely inside "this month"
    // regardless of which day of the month the suite happens to run on.
    const session2 = await prisma.lessonSession.create({
      data: { groupId: group.id, teacherId: teacher.id, date: new Date(today.getTime() - 3 * 60 * 60 * 1000), topic: 'Unit 2' },
    })
    await prisma.attendance.create({
      data: { lessonSessionId: session2.id, studentId: student.id, status: 'ABSENT' },
    })

    const category = await prisma.assessmentCategory.create({ data: { levelId: level.id, name: 'Speaking' } })
    const assessment = await prisma.assessment.create({
      data: { groupId: group.id, categoryId: category.id, title: 'Week 1', type: 'WEEKLY', date: today, maxScore: 10 },
    })
    await prisma.assessmentResult.create({
      data: { assessmentId: assessment.id, studentId: student.id, score: 9 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/students/${student.id}/progress?kind=month`,
      headers: { cookie },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.attendanceRate).toBe(50) // 1 present out of 2 countable records
    expect(body.homeworkRate).toBe(80) // only the one graded entry counts
    expect(body.academicByCategory.Speaking).toBe(90) // 9/10 = 90%
    expect(body.quizAverage).toBeNull()
    expect(body.points).toBe(0)
  })

  it('forbids a teacher from viewing progress without scoping to one of their own groups', async () => {
    await seedAcademicStructure()
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')

    const student = await prisma.student.create({
      data: { firstName: 'X', lastName: 'Y', dob: new Date('2012-01-01') },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/students/${student.id}/progress?kind=month`,
      headers: { cookie },
    })
    expect(res.statusCode).toBe(403)
  })

  it('allows a teacher to view progress scoped to their own group', async () => {
    const { group, student } = await seedAcademicStructure()
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')

    const res = await app.inject({
      method: 'GET',
      url: `/students/${student.id}/progress?kind=month&groupId=${group.id}`,
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
  })
})
