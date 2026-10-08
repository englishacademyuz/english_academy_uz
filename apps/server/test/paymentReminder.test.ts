import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { tashkentToday, toStoredDate } from '@tashkurgan/shared'
import { buildApp } from '../src/app'
import { formatPaymentReminder } from '../src/bot/format'
import type { PaymentReminderAnnouncement } from '../src/routes/payments'
import { createAdmin, loginAs, miniAppAuth, resetDb, seedAcademicStructure, TEST_BOT_TOKEN } from './helpers'

/** A stored date `offset` days from today in Tashkent. */
function daysFromToday(offset: number) {
  const date = toStoredDate(tashkentToday())
  date.setUTCDate(date.getUTCDate() + offset)
  return date
}

/** A join date whose first month fell due `daysPastDue` days ago -- each month is paid ahead, on the day it starts. */
const joinedWithFirstDue = (daysPastDue: number) => daysFromToday(-daysPastDue)

describe('payment reminders', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  const sent: Array<{ chatIds: string[]; reminder: PaymentReminderAnnouncement }> = []

  beforeAll(async () => {
    app = await buildApp({
      telegramBotToken: TEST_BOT_TOKEN,
      paymentReminderNotifier: async (chatIds, reminder) => {
        sent.push({ chatIds, reminder })
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

  async function setup(joinedAt: Date) {
    const seeded = await seedAcademicStructure()
    await prisma.group.update({ where: { id: seeded.group.id }, data: { monthlyFee: 400_000 } })
    await prisma.student.update({ where: { id: seeded.student.id }, data: { joinedAt } })
    await prisma.telegramLink.create({ data: { chatId: '777', studentId: seeded.student.id } })
    await createAdmin()
    const cookie = await loginAs(app, 'admin', 'admin12345')
    return { ...seeded, cookie }
  }

  it('creates a student with the day they joined', async () => {
    const { cookie } = await setup(daysFromToday(0))
    const res = await app.inject({
      method: 'POST',
      url: '/students',
      headers: { cookie },
      payload: { firstName: 'Vali', lastName: 'B', age: 12, joinedAt: '2026-09-15' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().joinedAt).toBe('2026-09-15T00:00:00.000Z')
  })

  it('shows a debtor on the students list and sends the reminder to their chats', async () => {
    const { student, cookie } = await setup(joinedWithFirstDue(8))

    const list = await app.inject({ method: 'GET', url: '/students', headers: { cookie } })
    const row = list.json().find((s: { id: string }) => s.id === student.id)
    expect(row.paymentReminder).toMatchObject({ stage: 'debtor', daysLeft: -8, amount: 400_000 })

    const res = await app.inject({ method: 'POST', url: `/students/${student.id}/payment-reminder`, headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json().notifiedChats).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0].chatIds).toEqual(['777'])
    expect(sent[0].reminder).toMatchObject({ stage: 'debtor', studentName: 'Ali K' })
  })

  it('goes quiet once the month is paid', async () => {
    const joined = joinedWithFirstDue(2)
    const { student, cookie } = await setup(joined)
    await app.inject({
      method: 'POST',
      url: `/students/${student.id}/payments`,
      headers: { cookie },
      payload: { year: joined.getUTCFullYear(), month: joined.getUTCMonth() + 1, amountDue: 400_000, amountPaid: 400_000 },
    })

    // The next payment day is about four weeks away.
    const overview = await app.inject({ method: 'GET', url: `/students/${student.id}/overview`, headers: { cookie } })
    expect(overview.json().payments.reminder).toBeNull()

    const res = await app.inject({ method: 'POST', url: `/students/${student.id}/payment-reminder`, headers: { cookie } })
    expect(res.statusCode).toBe(400)
    expect(sent).toHaveLength(0)
  })

  it('asks for the first month on the day the student joins', async () => {
    const { student, cookie } = await setup(daysFromToday(0))
    const list = await app.inject({ method: 'GET', url: '/students', headers: { cookie } })
    expect(list.json().find((s: { id: string }) => s.id === student.id).paymentReminder).toMatchObject({
      stage: 'due',
      daysLeft: 0,
      amount: 400_000,
    })
    const home = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth('777') })
    expect(home.json().payment).toMatchObject({ stage: 'due', daysLeft: 0 })
  })

  it('warns the student on the Mini App home screen', async () => {
    await setup(joinedWithFirstDue(1))
    const res = await app.inject({ method: 'GET', url: '/student/home', headers: miniAppAuth('777') })
    expect(res.statusCode).toBe(200)
    expect(res.json().payment).toMatchObject({ stage: 'overdue', daysLeft: -1, amount: 400_000 })
  })
})

describe('formatPaymentReminder', () => {
  const base = { studentName: 'Ali <K>', dueDate: '2026-10-15T00:00:00.000Z', unpaidCycles: 1, amount: 400_000 }

  it('counts down before the payment day', () => {
    const text = formatPaymentReminder({ ...base, stage: 'upcoming', daysLeft: 3 })
    expect(text).toContain('3 kundan soʻng toʻlov kuni')
    expect(text).toContain('Ali &lt;K&gt;')
    expect(text).toContain('15-oktabr')
    expect(text).toContain('400 000 soʻm')
  })

  it('calls out a debtor', () => {
    const text = formatPaymentReminder({ ...base, stage: 'debtor', daysLeft: -7, unpaidCycles: 2 })
    expect(text).toContain('qarzdorlik')
    expect(text).toContain('Toʻlanmagan oylar: 2 ta')
  })
})
