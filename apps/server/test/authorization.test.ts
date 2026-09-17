import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { resetDb, createTeacherUser, loginAs } from './helpers'

describe('authorization', () => {
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

  it('forbids a teacher from creating a subject', async () => {
    await createTeacherUser('teacher1', 'teacher12345')
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')

    const res = await app.inject({
      method: 'POST',
      url: '/subjects',
      headers: { cookie },
      payload: { name: 'Mathematics' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('forbids a teacher from creating a group', async () => {
    await createTeacherUser('teacher1', 'teacher12345')
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')

    const res = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: { cookie },
      payload: {
        levelId: 'nonexistent',
        teacherId: 'nonexistent',
        name: 'X',
        scheduleDays: ['MON'],
        scheduleTime: '18:00',
        startDate: new Date().toISOString(),
      },
    })
    expect(res.statusCode).toBe(403)
  })
})
