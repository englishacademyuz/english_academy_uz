import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { tashkentToday } from '@tashkurgan/shared'
import { buildApp } from '../src/app'
import { createAdmin, loginAs, resetDb, seedAcademicStructure } from './helpers'

describe('student create / edit / delete', () => {
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

  it('takes an age instead of a birth date', async () => {
    const cookie = await adminCookie()
    const res = await app.inject({
      method: 'POST',
      url: '/students',
      headers: { cookie },
      payload: { firstName: 'Vali', lastName: 'B', age: 12 },
    })
    expect(res.statusCode).toBe(200)
    expect(new Date(res.json().dob).getUTCFullYear()).toBe(tashkentToday().year - 12)
  })

  it('edits a student, changing the birth date only when a new age is sent', async () => {
    const cookie = await adminCookie()
    const { student } = await seedAcademicStructure()

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/students/${student.id}`,
      headers: { cookie },
      payload: { firstName: 'Alisher', phone: '+998901234567' },
    })
    expect(renamed.json()).toMatchObject({ firstName: 'Alisher', phone: '+998901234567', dob: '2012-01-01T00:00:00.000Z' })

    const aged = await app.inject({ method: 'PATCH', url: `/students/${student.id}`, headers: { cookie }, payload: { age: 10 } })
    expect(new Date(aged.json().dob).getUTCFullYear()).toBe(tashkentToday().year - 10)
  })

  it('deletes a student with all their records', async () => {
    const cookie = await adminCookie()
    const { student } = await seedAcademicStructure()
    await prisma.payment.create({
      data: { studentId: student.id, year: 2026, month: 9, amountDue: 1, recordedByUserId: 'x' },
    })
    await prisma.telegramLink.create({ data: { chatId: '42', studentId: student.id } })

    const res = await app.inject({ method: 'DELETE', url: `/students/${student.id}`, headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(await prisma.student.count({ where: { id: student.id } })).toBe(0)
    expect(await prisma.enrollment.count({ where: { studentId: student.id } })).toBe(0)
    expect(await prisma.payment.count({ where: { studentId: student.id } })).toBe(0)
    expect(await prisma.telegramLink.count({ where: { studentId: student.id } })).toBe(0)
  })

  it("doesn't let a teacher delete a student", async () => {
    const { student } = await seedAcademicStructure()
    const cookie = await loginAs(app, 'teacher1', 'teacher12345')
    const res = await app.inject({ method: 'DELETE', url: `/students/${student.id}`, headers: { cookie } })
    expect(res.statusCode).toBe(403)
    expect(await prisma.student.count({ where: { id: student.id } })).toBe(1)
  })
})
