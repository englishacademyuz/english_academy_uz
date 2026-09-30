import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { buildApp } from '../src/app'
import { createAdmin, loginAs, miniAppAuth, resetDb, seedAcademicStructure, TEST_BOT_TOKEN } from './helpers'

describe('teacher phone', () => {
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

  async function adminCookie() {
    await createAdmin()
    return loginAs(app, 'admin', 'admin12345')
  }

  it('creates a teacher with a phone', async () => {
    const cookie = await adminCookie()
    const res = await app.inject({
      method: 'POST',
      url: '/teachers',
      headers: { cookie },
      payload: { fullName: 'Nodira Karimova', username: 'nodira', password: 'secret123', phone: '+998 90 123 45 67' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().phone).toBe('+998 90 123 45 67')
  })

  it("edits a teacher's phone, and a blank phone clears it", async () => {
    const cookie = await adminCookie()
    const { teacher } = await seedAcademicStructure()

    const set = await app.inject({ method: 'PATCH', url: `/teachers/${teacher.id}`, headers: { cookie }, payload: { phone: '+998911112233' } })
    expect(set.json()).toMatchObject({ phone: '+998911112233', fullName: 'Test Teacher' })

    const cleared = await app.inject({ method: 'PATCH', url: `/teachers/${teacher.id}`, headers: { cookie }, payload: { phone: '  ' } })
    expect(cleared.json().phone).toBeNull()
  })

  it("doesn't let a teacher edit teachers", async () => {
    const { teacher } = await seedAcademicStructure()
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const res = await app.inject({ method: 'PATCH', url: `/teachers/${teacher.id}`, headers: { cookie }, payload: { phone: '1' } })
    expect(res.statusCode).toBe(403)
  })

  it("shows the student their teacher's phone in the Mini App", async () => {
    const { teacher, student } = await seedAcademicStructure()
    await prisma.teacher.update({ where: { id: teacher.id }, data: { phone: '+998 90 123 45 67' } })
    await prisma.telegramLink.create({ data: { chatId: '321', studentId: student.id } })

    const profile = await app.inject({ method: 'GET', url: '/student/profile', headers: miniAppAuth('321') })
    expect(profile.json().group).toMatchObject({ teacher: 'Test Teacher', teacherPhone: '+998 90 123 45 67' })
  })
})
