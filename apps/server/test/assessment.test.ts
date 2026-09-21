import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { resetDb, createAdmin, loginAs, seedAcademicStructure } from './helpers'

describe('assessments', () => {
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

  it('creates a single-category assessment with results in one call', async () => {
    const { level, group, student } = await seedAcademicStructure()
    await createAdmin()
    const adminCookie = await loginAs(app, 'admin', 'admin12345')

    const category = await app.inject({
      method: 'POST',
      url: `/levels/${level.id}/assessment-categories`,
      headers: { cookie: adminCookie },
      payload: { name: 'Speaking' },
    })
    expect(category.statusCode).toBe(200)

    const teacherCookie = await loginAs(app, 'teacher1', 'teacher12345')
    const assessment = await app.inject({
      method: 'POST',
      url: `/groups/${group.id}/assessments`,
      headers: { cookie: teacherCookie },
      payload: {
        categoryId: category.json().id,
        title: 'Week 3 Speaking',
        type: 'WEEKLY',
        date: '2026-09-17',
        maxScore: 100,
        results: [{ studentId: student.id, score: 85 }],
      },
    })

    expect(assessment.statusCode).toBe(200)
    const body = assessment.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0].score).toBe(85)
  })

  it('rejects a score above the assessment max score', async () => {
    const { level, group, student } = await seedAcademicStructure()
    await createAdmin()
    const adminCookie = await loginAs(app, 'admin', 'admin12345')

    const category = await app.inject({
      method: 'POST',
      url: `/levels/${level.id}/assessment-categories`,
      headers: { cookie: adminCookie },
      payload: { name: 'Grammar' },
    })

    const teacherCookie = await loginAs(app, 'teacher1', 'teacher12345')
    const res = await app.inject({
      method: 'POST',
      url: `/groups/${group.id}/assessments`,
      headers: { cookie: teacherCookie },
      payload: {
        categoryId: category.json().id,
        title: 'Week 3 Grammar',
        type: 'WEEKLY',
        date: '2026-09-17',
        maxScore: 20,
        results: [{ studentId: student.id, score: 85 }],
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('retiring a category keeps it on historical assessments but hides it from new-category listings', async () => {
    const { level } = await seedAcademicStructure()
    await createAdmin()
    const adminCookie = await loginAs(app, 'admin', 'admin12345')

    const category = await app.inject({
      method: 'POST',
      url: `/levels/${level.id}/assessment-categories`,
      headers: { cookie: adminCookie },
      payload: { name: 'Writing' },
    })
    const categoryId = category.json().id

    await app.inject({
      method: 'PATCH',
      url: `/assessment-categories/${categoryId}/retire`,
      headers: { cookie: adminCookie },
    })

    const listed = await app.inject({
      method: 'GET',
      url: `/levels/${level.id}/assessment-categories`,
      headers: { cookie: adminCookie },
    })
    expect(listed.json()).toHaveLength(0)

    const stillExists = await prisma.assessmentCategory.findUnique({ where: { id: categoryId } })
    expect(stillExists).not.toBeNull()
    expect(stillExists?.retiredAt).not.toBeNull()
  })

  it('auto-syncs Rating points from a graded result when the category has pointsWorth, recomputing rather than duplicating on re-grade', async () => {
    const { level, group, student } = await seedAcademicStructure()
    await createAdmin()
    const adminCookie = await loginAs(app, 'admin', 'admin12345')

    const category = await app.inject({
      method: 'POST',
      url: `/levels/${level.id}/assessment-categories`,
      headers: { cookie: adminCookie },
      payload: { name: 'Homework', maxScore: 100, pointsWorth: 2 },
    })
    const categoryId = category.json().id

    const teacherCookie = await loginAs(app, 'teacher1', 'teacher12345')
    const create = async (score: number) =>
      app.inject({
        method: 'POST',
        url: `/groups/${group.id}/assessments`,
        headers: { cookie: teacherCookie },
        payload: {
          categoryId,
          title: 'Homework',
          type: 'GENERAL',
          date: '2026-09-17',
          maxScore: 100,
          results: [{ studentId: student.id, score }],
        },
      })

    await create(50)
    let transactions = await prisma.pointTransaction.findMany({ where: { studentId: student.id } })
    expect(transactions).toHaveLength(1)
    expect(transactions[0].points).toBe(1) // 50% of a 2-point category, rounded

    await create(100)
    transactions = await prisma.pointTransaction.findMany({ where: { studentId: student.id } })
    expect(transactions).toHaveLength(1) // still one row -- recomputed, not appended
    expect(transactions[0].points).toBe(2)
  })

  it('does not create a Rating point transaction when the category has no pointsWorth', async () => {
    const { level, group, student } = await seedAcademicStructure()
    await createAdmin()
    const adminCookie = await loginAs(app, 'admin', 'admin12345')

    const category = await app.inject({
      method: 'POST',
      url: `/levels/${level.id}/assessment-categories`,
      headers: { cookie: adminCookie },
      payload: { name: 'Speaking' },
    })

    const teacherCookie = await loginAs(app, 'teacher1', 'teacher12345')
    await app.inject({
      method: 'POST',
      url: `/groups/${group.id}/assessments`,
      headers: { cookie: teacherCookie },
      payload: {
        categoryId: category.json().id,
        title: 'Week 3 Speaking',
        type: 'WEEKLY',
        date: '2026-09-17',
        maxScore: 100,
        results: [{ studentId: student.id, score: 85 }],
      },
    })

    const transactions = await prisma.pointTransaction.findMany({ where: { studentId: student.id } })
    expect(transactions).toHaveLength(0)
  })

  it('forbids a teacher from managing assessment categories', async () => {
    const { level } = await seedAcademicStructure()
    const teacherCookie = await loginAs(app, 'teacher1', 'teacher12345')

    const res = await app.inject({
      method: 'POST',
      url: `/levels/${level.id}/assessment-categories`,
      headers: { cookie: teacherCookie },
      payload: { name: 'Reading' },
    })
    expect(res.statusCode).toBe(403)
  })
})
