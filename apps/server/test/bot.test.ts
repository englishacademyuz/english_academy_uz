import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { createBot } from '../src/bot/client'
import { resetDb } from './helpers'

// A fake botInfo skips grammY's real getMe network call entirely -- this
// suite never talks to Telegram; see buildBot()'s API transformer below.
const FAKE_BOT_INFO = {
  id: 1,
  is_bot: true as const,
  first_name: 'Test Bot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
}

type CapturedCall = { method: string; payload: Record<string, unknown> }

function buildBot() {
  const bot = createBot('test-token', FAKE_BOT_INFO)
  const calls: CapturedCall[] = []
  // The one true external dependency (the real Telegram API) is intercepted
  // here instead of mocked deeper in the handler code -- everything else
  // (DB access, domain logic, grammY's own update routing) runs for real.
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> })
    return Promise.resolve({ ok: true, result: {} as never })
  })
  return { bot, calls }
}

let nextUpdateId = 1

function textUpdate(chatId: number, text: string) {
  return {
    update_id: nextUpdateId++,
    message: {
      message_id: nextUpdateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'private' as const, first_name: 'Test' },
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      text,
    },
  }
}

function callbackUpdate(chatId: number, data: string) {
  return {
    update_id: nextUpdateId++,
    callback_query: {
      id: String(nextUpdateId),
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      chat_instance: 'test',
      data,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private' as const, first_name: 'Test' },
      },
    },
  }
}

describe('telegram bot', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('links an unrecognized chat that sends a valid linking code', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Ali', lastName: 'K', dob: new Date('2012-01-01') },
    })
    const linkingCode = await prisma.linkingCode.create({
      data: {
        code: 'ABCD1234',
        targetType: 'STUDENT',
        targetId: student.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    })

    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate(textUpdate(111, linkingCode.code))

    const user = await prisma.user.findUnique({ where: { telegramChatId: '111' } })
    expect(user?.role).toBe('STUDENT')

    const linkedStudent = await prisma.student.findUnique({ where: { userId: user!.id } })
    expect(linkedStudent?.id).toBe(student.id)

    const consumed = await prisma.linkingCode.findUnique({ where: { code: linkingCode.code } })
    expect(consumed?.consumedAt).not.toBeNull()

    const confirmed = calls.some((c) => c.method === 'sendMessage' && String(c.payload.text).includes('ulandi'))
    expect(confirmed).toBe(true)
  })

  it('rejects an invalid linking code with a clear message', async () => {
    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate(textUpdate(112, 'NOTREAL1'))

    const user = await prisma.user.findUnique({ where: { telegramChatId: '112' } })
    expect(user).toBeNull()

    const rejected = calls.some((c) => c.method === 'sendMessage' && String(c.payload.text).includes('notoʻgʻri'))
    expect(rejected).toBe(true)
  })

  it('shows a linked student their own progress', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Ali', lastName: 'K', dob: new Date('2012-01-01') },
    })
    const user = await prisma.user.create({ data: { role: 'STUDENT', telegramChatId: '222' } })
    await prisma.student.update({ where: { id: student.id }, data: { userId: user.id } })

    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate(textUpdate(222, '📊 Progressim'))

    const sent = calls.find((c) => c.method === 'sendMessage' && String(c.payload.text).includes('Progress'))
    expect(sent).toBeDefined()
    expect(sent?.payload.parse_mode).toBe('HTML')
  })

  it('requires a parent to select a child, and refuses a child that is not theirs', async () => {
    const parentUser = await prisma.user.create({ data: { role: 'PARENT', telegramChatId: '333' } })
    const parent = await prisma.parent.create({ data: { fullName: 'Test Parent', userId: parentUser.id } })
    const ownChild = await prisma.student.create({
      data: { firstName: 'Own', lastName: 'Child', dob: new Date('2012-01-01') },
    })
    const otherChild = await prisma.student.create({
      data: { firstName: 'Other', lastName: 'Child', dob: new Date('2012-01-01') },
    })
    await prisma.parentStudentLink.create({ data: { parentId: parent.id, studentId: ownChild.id } })
    // otherChild is deliberately left unlinked to this parent.

    const { bot, calls } = buildBot()
    await bot.init()

    await bot.handleUpdate(textUpdate(333, '📊 Progressi'))
    expect(calls.some((c) => c.method === 'sendMessage' && String(c.payload.text).includes('Farzandlarim'))).toBe(
      true,
    )

    calls.length = 0
    await bot.handleUpdate(callbackUpdate(333, `child:${otherChild.id}`))
    expect(
      calls.some((c) => c.method === 'answerCallbackQuery' && String(c.payload.text).includes('Ruxsat')),
    ).toBe(true)

    calls.length = 0
    await bot.handleUpdate(callbackUpdate(333, `child:${ownChild.id}`))
    expect(calls.some((c) => c.method === 'sendMessage' && String(c.payload.text).includes('Own'))).toBe(true)
  })
})
