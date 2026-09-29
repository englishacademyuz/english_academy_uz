import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { createAdmin, createTeacherUser, loginAs, resetDb, seedAcademicStructure } from './helpers'

describe('curriculum rename/delete', () => {
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

  async function adminCookie() {
    await createAdmin()
    return loginAs(app, 'admin', 'admin12345')
  }

  /** A subject with a course and a level that no group ever used, plus one assessment category. */
  async function untaughtTree() {
    const subject = await prisma.subject.create({ data: { name: 'Math' } })
    const course = await prisma.course.create({ data: { name: 'Algebra', subjectId: subject.id } })
    const level = await prisma.level.create({ data: { name: 'Basic', courseId: course.id, color: '#10b981' } })
    await prisma.assessmentCategory.create({ data: { name: 'Test', levelId: level.id } })
    return { subject, course, level }
  }

  it('renames a subject, course and level', async () => {
    const cookie = await adminCookie()
    const { subject, course, level } = await untaughtTree()

    for (const [url, name] of [
      [`/subjects/${subject.id}`, 'Mathematics'],
      [`/courses/${course.id}`, 'Algebra I'],
      [`/levels/${level.id}`, 'Beginner'],
    ]) {
      const res = await app.inject({ method: 'PATCH', url, headers: { cookie }, payload: { name } })
      expect(res.statusCode).toBe(200)
      expect(res.json().name).toBe(name)
    }
  })

  it('rejects a rename that clashes with a sibling', async () => {
    const cookie = await adminCookie()
    const { subject, course } = await untaughtTree()
    await prisma.course.create({ data: { name: 'Geometry', subjectId: subject.id } })

    const res = await app.inject({
      method: 'PATCH',
      url: `/courses/${course.id}`,
      headers: { cookie },
      payload: { name: 'Geometry' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('deletes an untaught subject together with its courses, levels and categories', async () => {
    const cookie = await adminCookie()
    const { subject } = await untaughtTree()

    const res = await app.inject({ method: 'DELETE', url: `/subjects/${subject.id}`, headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(await prisma.subject.count()).toBe(0)
    expect(await prisma.course.count()).toBe(0)
    expect(await prisma.level.count()).toBe(0)
    expect(await prisma.assessmentCategory.count()).toBe(0)
  })

  it('deletes an untaught level but keeps its course', async () => {
    const cookie = await adminCookie()
    const { course, level } = await untaughtTree()

    const res = await app.inject({ method: 'DELETE', url: `/levels/${level.id}`, headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(await prisma.level.count()).toBe(0)
    expect(await prisma.course.findUnique({ where: { id: course.id } })).not.toBeNull()
  })

  it('refuses to delete anything a group was taught under, archived groups included', async () => {
    const { subject, course, level, group } = await seedAcademicStructure()
    const cookie = await adminCookie()
    await app.inject({ method: 'DELETE', url: `/groups/${group.id}`, headers: { cookie } })

    for (const url of [`/subjects/${subject.id}`, `/courses/${course.id}`, `/levels/${level.id}`]) {
      const res = await app.inject({ method: 'DELETE', url, headers: { cookie } })
      expect(res.statusCode).toBe(409)
    }
    expect(await prisma.level.count()).toBe(1)
  })

  it('does not let a teacher rename or delete curriculum', async () => {
    const { subject } = await untaughtTree()
    await createTeacherUser()
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/subjects/${subject.id}`,
      headers: { cookie },
      payload: { name: 'X' },
    })
    const deleted = await app.inject({ method: 'DELETE', url: `/subjects/${subject.id}`, headers: { cookie } })
    expect(renamed.statusCode).toBe(403)
    expect(deleted.statusCode).toBe(403)
  })
})
