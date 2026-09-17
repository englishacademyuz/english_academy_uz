import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { resetDb, createAdmin, createTeacherUser, loginAs, seedAcademicStructure } from './helpers'

describe('lesson sessions', () => {
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

  it('lets the owning teacher save topic, homework, materials, and attendance in one call', async () => {
    const { group, student, teacher } = await seedAcademicStructure()
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')

    const res = await app.inject({
      method: 'POST',
      url: `/groups/${group.id}/sessions`,
      headers: { cookie },
      payload: {
        date: '2026-09-17',
        topic: 'Present Perfect',
        materials: [{ type: 'LINK', content: 'https://example.com/unit5' }],
        homework: { instructions: 'Workbook Unit 5, Exercise 4-7' },
        attendance: [{ studentId: student.id, status: 'PRESENT' }],
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.topic).toBe('Present Perfect')
    expect(body.materials).toHaveLength(1)
    expect(body.homework.instructions).toContain('Unit 5')
    expect(body.attendances).toHaveLength(1)
    expect(body.attendances[0].status).toBe('PRESENT')
    expect(body.teacherId).toBe(teacher.id)
  })

  it('re-saving the same group and date updates the session instead of duplicating it', async () => {
    const { group } = await seedAcademicStructure()
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')

    await app.inject({
      method: 'POST',
      url: `/groups/${group.id}/sessions`,
      headers: { cookie },
      payload: { date: '2026-09-17', topic: 'First draft' },
    })
    await app.inject({
      method: 'POST',
      url: `/groups/${group.id}/sessions`,
      headers: { cookie },
      payload: { date: '2026-09-17', topic: 'Corrected topic' },
    })

    const sessions = await prisma.lessonSession.findMany({ where: { groupId: group.id } })
    expect(sessions).toHaveLength(1)
    expect(sessions[0].topic).toBe('Corrected topic')
  })

  it('forbids a teacher from recording a session for a group they do not own', async () => {
    const { group } = await seedAcademicStructure()
    await createTeacherUser('other-teacher', 'password123')
    const cookie = await loginAs(app, 'other-teacher', 'password123')

    const res = await app.inject({
      method: 'POST',
      url: `/groups/${group.id}/sessions`,
      headers: { cookie },
      payload: { date: '2026-09-17', topic: 'Should be rejected' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('records homework results for a session in a later call and excludes ungraded entries from the rate', async () => {
    const { group, student } = await seedAcademicStructure()
    await createAdmin()
    const cookie = await loginAs(app, 'admin', 'admin12345')

    const created = await app.inject({
      method: 'POST',
      url: `/groups/${group.id}/sessions`,
      headers: { cookie },
      payload: { date: '2026-09-17', homework: { instructions: 'Unit 5' } },
    })
    const sessionId = created.json().id

    const graded = await app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/homework-results`,
      headers: { cookie },
      payload: { results: [{ studentId: student.id, status: 'COMPLETED', score: 90 }] },
    })
    expect(graded.statusCode).toBe(200)

    const result = await prisma.homeworkResult.findFirst({ where: { studentId: student.id } })
    expect(result?.status).toBe('COMPLETED')
    expect(result?.score).toBe(90)
  })
})
