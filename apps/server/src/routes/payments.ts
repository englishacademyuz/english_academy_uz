import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import {
  assertCan,
  computeOutstanding,
  getGroupPaymentHistory,
  getGroupPaymentStatus,
  getPaymentReminder,
  markPaymentReminded,
  recordPayment,
  studentChatIds,
  type StudentPaymentReminder,
  updatePayment,
} from '@tashkurgan/domain'
import { NotFoundError, ValidationError } from '@tashkurgan/shared'

export type PaymentReminderAnnouncement = StudentPaymentReminder & { studentName: string }

/** Tells a student's Telegram chats a payment is coming up or overdue -- the bot in production, a no-op or spy in tests. */
export type PaymentReminderNotifier = (chatIds: string[], reminder: PaymentReminderAnnouncement) => Promise<void>

const studentParams = z.object({ id: z.string() })
const paymentParams = z.object({ id: z.string() })
const groupParams = z.object({ groupId: z.string() })
const groupPaymentsQuery = z.object({ year: z.coerce.number().int(), month: z.coerce.number().int().min(1).max(12) })

const recordSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  amountDue: z.number().int().nonnegative(),
  amountPaid: z.number().int().nonnegative().optional(),
  note: z.string().optional(),
})

const updateSchema = z.object({
  amountDue: z.number().int().nonnegative().optional(),
  amountPaid: z.number().int().nonnegative().optional(),
  note: z.string().optional(),
})

async function requireStudent(id: string) {
  const student = await prisma.student.findUnique({ where: { id } })
  if (!student) throw new NotFoundError('Student not found')
  return student
}

async function requireGroup(id: string) {
  const group = await prisma.group.findUnique({ where: { id } })
  if (!group) throw new NotFoundError('Group not found')
  return group
}

export const paymentRoutes: FastifyPluginAsync<{ notifier?: PaymentReminderNotifier }> = async (app, opts) => {
  const notifier: PaymentReminderNotifier = opts.notifier ?? (async () => {})

  app.get('/students/:id/payments', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'payment', action: 'view' })
    const { id } = studentParams.parse(request.params)
    await requireStudent(id)

    const payments = await prisma.payment.findMany({
      where: { studentId: id },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })
    return { payments, outstanding: computeOutstanding(payments) }
  })

  // One row per (Student, calendar month) -- calling this again for the
  // same month overwrites the previous amounts (§51.4/§51.5).
  app.post('/students/:id/payments', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'payment', action: 'manage' })
    const { id } = studentParams.parse(request.params)
    await requireStudent(id)
    const body = recordSchema.parse(request.body)

    return recordPayment({ studentId: id, ...body, recordedByUserId: request.actor!.userId })
  })

  app.patch('/payments/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'payment', action: 'manage' })
    const { id } = paymentParams.parse(request.params)
    const body = updateSchema.parse(request.body)

    return updatePayment(id, { ...body, recordedByUserId: request.actor!.userId })
  })

  // The accounting view of a group's roster -- one month's payment status
  // per actively enrolled student (§27/§51.4).
  app.get('/groups/:groupId/payments', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'payment', action: 'view' })
    const { groupId } = groupParams.parse(request.params)
    await requireGroup(groupId)
    const { year, month } = groupPaymentsQuery.parse(request.query)
    return getGroupPaymentStatus(groupId, year, month)
  })

  app.get('/groups/:groupId/payments-history', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'payment', action: 'view' })
    const { groupId } = groupParams.parse(request.params)
    await requireGroup(groupId)
    return getGroupPaymentHistory(groupId)
  })

  // The "remind about payment" button: shown from three days before the payment day until the
  // month is paid. Sends in the background (a slow Telegram call mustn't fail the request).
  app.post('/students/:id/payment-reminder', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'payment', action: 'manage' })
    const { id } = studentParams.parse(request.params)
    const student = await requireStudent(id)
    const reminder = await getPaymentReminder(id)
    if (!reminder) throw new ValidationError('Nothing is due for this student yet')

    const chatIds = await studentChatIds(id)
    notifier(chatIds, { ...reminder, studentName: `${student.firstName} ${student.lastName}` }).catch((err) =>
      request.log.error({ err, studentId: id }, 'Payment reminder failed'),
    )
    const updated = await markPaymentReminded(id)
    return { notifiedChats: chatIds.length, remindedAt: updated.paymentRemindedAt }
  })
}
