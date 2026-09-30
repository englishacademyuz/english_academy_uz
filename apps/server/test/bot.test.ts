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

const MINI_APP_URL = 'https://example.test/student'

type CapturedCall = { method: string; payload: Record<string, unknown> }

function buildBot() {
  const bot = createBot('test-token', { botInfo: FAKE_BOT_INFO, miniAppUrl: MINI_APP_URL })
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
      // A leading "/word" is a command only when Telegram marks it with a bot_command entity.
      ...(text.startsWith('/')
        ? { entities: [{ type: 'bot_command' as const, offset: 0, length: text.split(' ')[0].length }] }
        : {}),
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
    // Leaving dirty rows behind would trip the next test file's seedAcademicStructure()
    // (Subject.name is unique) -- clean up after the last test too, not just before the first.
    await resetDb()
    await prisma.$disconnect()
  })

  async function issueCode(studentId: string, code: string, expiresInMs = 3_600_000) {
    return prisma.linkingCode.create({ data: { code, studentId, expiresAt: new Date(Date.now() + expiresInMs) } })
  }

  const sentText = (calls: CapturedCall[], fragment: string) =>
    calls.some((c) => c.method === 'sendMessage' && String(c.payload.text).includes(fragment))

  it('lets the student and a parent link their own chats with the same code', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Ali', lastName: 'K', dob: new Date('2012-01-01') },
    })
    await issueCode(student.id, 'ABCD2345')

    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate(textUpdate(111, 'ABCD2345'))
    // A parent pastes it with stray spaces/lowercase -- still the same code.
    await bot.handleUpdate(textUpdate(112, ' abcd 2345 '))

    const links = await prisma.telegramLink.findMany({ where: { studentId: student.id }, orderBy: { chatId: 'asc' } })
    expect(links.map((l) => l.chatId)).toEqual(['111', '112'])
    expect(calls.filter((c) => c.method === 'sendMessage' && String(c.payload.text).includes('ulandi'))).toHaveLength(2)
  })

  it('tells an unknown code apart from an expired one', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Ali', lastName: 'K', dob: new Date('2012-01-01') },
    })
    await issueCode(student.id, 'EXPD2345', -1000)

    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate(textUpdate(113, 'NOTREAL2'))
    expect(sentText(calls, 'topilmadi')).toBe(true)

    calls.length = 0
    await bot.handleUpdate(textUpdate(113, 'EXPD2345'))
    expect(sentText(calls, 'muddati tugagan')).toBe(true)

    expect(await prisma.telegramLink.count()).toBe(0)
  })

  it("re-points a linked chat when it sends another student's code", async () => {
    const first = await prisma.student.create({ data: { firstName: 'Ali', lastName: 'K', dob: new Date('2012-01-01') } })
    const second = await prisma.student.create({ data: { firstName: 'Vali', lastName: 'K', dob: new Date('2014-01-01') } })
    await prisma.telegramLink.create({ data: { chatId: '114', studentId: first.id } })
    await issueCode(second.id, 'SWAP2345')

    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate(textUpdate(114, 'SWAP2345'))

    const link = await prisma.telegramLink.findUnique({ where: { chatId: '114' } })
    expect(link?.studentId).toBe(second.id)
    expect(sentText(calls, 'Vali')).toBe(true)
  })

  /** Every web_app button URL in the inline keyboards the bot sent. */
  const webAppUrls = (calls: CapturedCall[]) =>
    calls.flatMap((c) => {
      const markup = c.payload.reply_markup as { inline_keyboard?: Array<Array<{ web_app?: { url: string } }>> }
      return (markup?.inline_keyboard ?? []).flat().flatMap((b) => (b.web_app ? [b.web_app.url] : []))
    })

  it('answers a linked chat with Mini App buttons and clears the old reply keyboard', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Ali', lastName: 'K', dob: new Date('2012-01-01') },
    })
    await prisma.telegramLink.create({ data: { chatId: '222', studentId: student.id } })

    const { bot, calls } = buildBot()
    await bot.init()
    // A tap on the old text keyboard now just brings up the Mini App menu.
    await bot.handleUpdate(textUpdate(222, '📊 Progressim'))

    expect(calls.some((c) => (c.payload.reply_markup as { remove_keyboard?: boolean })?.remove_keyboard)).toBe(true)
    expect(sentText(calls, 'Ali K')).toBe(true)
    const urls = webAppUrls(calls)
    expect(urls).toContain(MINI_APP_URL)
    expect(urls).toContain(`${MINI_APP_URL}/progress`)
    expect(urls).toContain(`${MINI_APP_URL}/quizzes`)
  })

  it('points buttons left on old chat messages to the Mini App instead of acting on them', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Ali', lastName: 'K', dob: new Date('2012-01-01') },
    })
    await prisma.telegramLink.create({ data: { chatId: '444', studentId: student.id } })

    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate(callbackUpdate(444, 'lessons:0'))

    expect(calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true)
    expect(webAppUrls(calls)).toContain(`${MINI_APP_URL}/lessons`)
  })

  it('relays other text to the teacher, confirming only the first of a run', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Ali', lastName: 'K', dob: new Date('2012-01-01') },
    })
    await prisma.telegramLink.create({ data: { chatId: '666', studentId: student.id } })

    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate(textUpdate(666, 'Assalomu alaykum, Ali bugun kelolmaydi'))
    await bot.handleUpdate(textUpdate(666, 'Isitmasi bor'))

    const messages = await prisma.chatMessage.findMany({ orderBy: { createdAt: 'asc' } })
    expect(messages.map((m) => [m.sender, m.senderChatId, m.senderName, m.text])).toEqual([
      ['FAMILY', '666', 'Test', 'Assalomu alaykum, Ali bugun kelolmaydi'],
      ['FAMILY', '666', 'Test', 'Isitmasi bor'],
    ])
    expect(calls.filter((c) => c.method === 'setMessageReaction')).toHaveLength(2)
    expect(calls.filter((c) => c.method === 'sendMessage' && String(c.payload.text).includes('yuborildi'))).toHaveLength(1)
    expect(webAppUrls(calls)).toContain(`${MINI_APP_URL}/chat`)
    // Relayed text doesn't bring up the menu.
    expect(sentText(calls, 'Ali K')).toBe(false)
  })

  it('asks for text when a linked chat sends a photo', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Ali', lastName: 'K', dob: new Date('2012-01-01') },
    })
    await prisma.telegramLink.create({ data: { chatId: '667', studentId: student.id } })

    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate({
      update_id: nextUpdateId++,
      message: {
        message_id: nextUpdateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 667, type: 'private' as const, first_name: 'Test' },
        from: { id: 667, is_bot: false, first_name: 'Test' },
        photo: [{ file_id: 'x', file_unique_id: 'x', width: 1, height: 1 }],
      },
    })
    expect(sentText(calls, 'faqat matnli')).toBe(true)
    expect(await prisma.chatMessage.count()).toBe(0)
  })

  it('tells an unlinked chat to send its code on /start', async () => {
    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate(textUpdate(555, '/start'))
    expect(sentText(calls, 'kodini yuboring')).toBe(true)
    expect(webAppUrls(calls)).toHaveLength(0)
  })
})
