import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@tashkurgan/db'
import { createBot, type BotOptions } from '../src/bot/client'
import type { HomeworkFileStore } from '../src/telegram/fileStore'
import { resetDb, seedAcademicStructure } from './helpers'

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

function buildBot(options: Partial<BotOptions> = {}) {
  const bot = createBot('test-token', { botInfo: FAKE_BOT_INFO, miniAppUrl: MINI_APP_URL, ...options })
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

  function photoUpdate(chatId: number, fileId: string) {
    return {
      update_id: nextUpdateId++,
      message: {
        message_id: nextUpdateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private' as const, first_name: 'Test' },
        from: { id: chatId, is_bot: false, first_name: 'Test' },
        photo: [
          { file_id: `${fileId}-small`, file_unique_id: `${fileId}-s`, width: 90, height: 60 },
          { file_id: fileId, file_unique_id: `${fileId}-u`, width: 1280, height: 960 },
        ],
      },
    }
  }

  const keepingStore: HomeworkFileStore = {
    upload: async () => {
      throw new Error('not used by the bot')
    },
    keep: async (photo) => photo,
    keepVoice: async (voice) => voice,
    keepVideo: async (video) => video,
    download: async () => {
      throw new Error('not used by the bot')
    },
  }

  function voiceUpdate(chatId: number, fileId: string, fileSize = 40_000) {
    return {
      update_id: nextUpdateId++,
      message: {
        message_id: nextUpdateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private' as const, first_name: 'Test' },
        from: { id: chatId, is_bot: false, first_name: 'Test' },
        voice: { file_id: fileId, file_unique_id: `${fileId}-u`, duration: 42, mime_type: 'audio/ogg', file_size: fileSize },
      },
    }
  }

  it('hands voice notes in for the newest homework, alongside photos', async () => {
    const { group, student } = await seedAcademicStructure()
    await prisma.group.update({ where: { id: group.id }, data: { homeworkSubmissionEnabled: true } })
    await prisma.telegramLink.create({ data: { chatId: '670', studentId: student.id } })
    await prisma.lessonSession.create({
      data: { groupId: group.id, teacherId: group.teacherId, date: new Date('2026-09-27'), topic: 'Speaking', homework: { create: { instructions: 'Talk' } } },
    })

    const { bot, calls } = buildBot({ fileStore: keepingStore, homeworkReceiptDelayMs: 0 })
    await bot.init()
    await bot.handleUpdate(photoUpdate(670, 'photo-v'))
    await bot.handleUpdate(voiceUpdate(670, 'voice-a'))
    await new Promise((resolve) => setTimeout(resolve, 50))

    const submission = await prisma.homeworkSubmission.findFirstOrThrow({ include: { voices: true, photos: true } })
    expect(submission.voices).toMatchObject([{ telegramFileId: 'voice-a', duration: 42 }])
    expect(submission.photos).toHaveLength(1)
    const receipt = calls.filter((c) => c.method === 'sendMessage' && String(c.payload.text).includes('qabul qilindi')).at(-1)!
    expect(String(receipt.payload.text)).toContain('Ovozli xabarlar: 1 ta')
    expect(String(receipt.payload.text)).toContain('Rasmlar: 1 ta')

    // Too big for the Bot API to download back -- refused, not stored.
    await bot.handleUpdate(voiceUpdate(670, 'voice-huge', 30 * 1024 * 1024))
    expect(sentText(calls, '20 MB')).toBe(true)
    expect(await prisma.homeworkVoice.count()).toBe(1)
    expect(sentText(calls, 'faqat matnli')).toBe(false)
  })

  it('still asks for text when a voice note comes from a group that does not take homework', async () => {
    const { student } = await seedAcademicStructure()
    await prisma.telegramLink.create({ data: { chatId: '671', studentId: student.id } })
    const { bot, calls } = buildBot({ fileStore: keepingStore, homeworkReceiptDelayMs: 0 })
    await bot.init()
    await bot.handleUpdate(voiceUpdate(671, 'voice-b'))
    expect(sentText(calls, 'faqat matnli')).toBe(true)
    expect(await prisma.homeworkVoice.count()).toBe(0)
  })

  function videoUpdate(chatId: number, fileId: string, { round = false, fileSize = 3_000_000 } = {}) {
    const file = { file_id: fileId, file_unique_id: `${fileId}-u`, duration: 55, file_size: fileSize }
    return {
      update_id: nextUpdateId++,
      message: {
        message_id: nextUpdateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private' as const, first_name: 'Test' },
        from: { id: chatId, is_bot: false, first_name: 'Test' },
        ...(round ? { video_note: { ...file, length: 384 } } : { video: { ...file, width: 720, height: 1280, mime_type: 'video/mp4' } }),
      },
    }
  }

  async function seedSpeakingHomework(chatId: string, dueDate: Date | null = null) {
    const { group, student } = await seedAcademicStructure()
    await prisma.group.update({ where: { id: group.id }, data: { homeworkSubmissionEnabled: true } })
    await prisma.telegramLink.create({ data: { chatId, studentId: student.id } })
    await prisma.lessonSession.create({
      data: {
        groupId: group.id,
        teacherId: group.teacherId,
        date: new Date('2026-09-27'),
        topic: 'Speaking',
        homework: { create: { instructions: 'Talk about your day', dueDate } },
      },
    })
  }

  it('hands round and regular videos in for the newest homework', async () => {
    await seedSpeakingHomework('672')
    const { bot, calls } = buildBot({ fileStore: keepingStore, homeworkReceiptDelayMs: 0 })
    await bot.init()
    await bot.handleUpdate(videoUpdate(672, 'video-round', { round: true }))
    await bot.handleUpdate(videoUpdate(672, 'video-flat'))
    await new Promise((resolve) => setTimeout(resolve, 50))

    const videos = await prisma.homeworkVideo.findMany({ orderBy: { createdAt: 'asc' } })
    expect(videos).toMatchObject([
      { telegramFileId: 'video-round', round: true, duration: 55, width: 384 },
      { telegramFileId: 'video-flat', round: false, width: 720, height: 1280 },
    ])
    const receipt = calls.filter((c) => c.method === 'sendMessage' && String(c.payload.text).includes('qabul qilindi')).at(-1)!
    expect(String(receipt.payload.text)).toContain('Videolar: 2 ta')

    // Too big for the Bot API to download back -- refused, not stored.
    await bot.handleUpdate(videoUpdate(672, 'video-huge', { fileSize: 40 * 1024 * 1024 }))
    expect(sentText(calls, '20 MB')).toBe(true)
    expect(await prisma.homeworkVideo.count()).toBe(2)
  })

  it('turns files away with a sad face once the deadline has passed', async () => {
    await seedSpeakingHomework('673', new Date('2026-09-28'))
    // A real (short) wait for the rest of the album, so its files get one answer.
    const { bot, calls } = buildBot({ fileStore: keepingStore, homeworkReceiptDelayMs: 300 })
    await bot.init()
    await bot.handleUpdate(videoUpdate(673, 'video-late', { round: true }))
    await bot.handleUpdate(photoUpdate(673, 'photo-late'))
    await new Promise((resolve) => setTimeout(resolve, 600))

    expect(await prisma.homeworkSubmission.count()).toBe(0)
    expect(sentText(calls, '😔')).toBe(true)
    expect(sentText(calls, 'muddati tugagan')).toBe(true)
    // Due 28 September, by 23:59 in Tashkent.
    expect(sentText(calls, '28.09.2026 23:59')).toBe(true)
    // An album gets one answer, not one per file.
    expect(calls.filter((c) => c.method === 'sendMessage' && c.payload.text === '😔')).toHaveLength(1)
  })

  it("hands photos in for the newest homework in groups that take them, with one receipt per album", async () => {
    const { group, student } = await seedAcademicStructure()
    await prisma.group.update({ where: { id: group.id }, data: { homeworkSubmissionEnabled: true } })
    await prisma.telegramLink.create({ data: { chatId: '668', studentId: student.id } })
    for (const [day, topic] of [['2026-09-20', 'Old'], ['2026-09-27', 'Newest']]) {
      await prisma.lessonSession.create({
        data: { groupId: group.id, teacherId: group.teacherId, date: new Date(day), topic, homework: { create: { instructions: 'Do it' } } },
      })
    }

    const { bot, calls } = buildBot({ fileStore: keepingStore, homeworkReceiptDelayMs: 0 })
    await bot.init()
    await bot.handleUpdate(photoUpdate(668, 'photo-a'))
    await bot.handleUpdate(photoUpdate(668, 'photo-b'))
    await new Promise((resolve) => setTimeout(resolve, 50))

    const submission = await prisma.homeworkSubmission.findFirstOrThrow({
      include: { photos: true, homework: { include: { lessonSession: true } } },
    })
    expect(submission.homework.lessonSession.topic).toBe('Newest')
    // The biggest size Telegram made of each photo is the one kept.
    expect(submission.photos.map((p) => p.telegramFileId).sort()).toEqual(['photo-a', 'photo-b'])
    const receipts = calls.filter((c) => c.method === 'sendMessage' && String(c.payload.text).includes('qabul qilindi'))
    expect(receipts.length).toBeLessThanOrEqual(2)
    expect(String(receipts.at(-1)!.payload.text)).toContain('2 ta')
    expect(sentText(calls, 'faqat matnli')).toBe(false)
  })

  it('still asks for text when the group does not take homework photos', async () => {
    const { student } = await seedAcademicStructure()
    await prisma.telegramLink.create({ data: { chatId: '669', studentId: student.id } })
    const { bot, calls } = buildBot({ fileStore: keepingStore, homeworkReceiptDelayMs: 0 })
    await bot.init()
    await bot.handleUpdate(photoUpdate(669, 'photo-c'))
    expect(sentText(calls, 'faqat matnli')).toBe(true)
    expect(await prisma.homeworkSubmission.count()).toBe(0)
  })

  /** Ali (in a group that takes homework) and his sister Vali (not in one), tied as siblings; the phone is linked through Vali's code. */
  async function seedSiblings(chatId: string) {
    const { group, student: ali } = await seedSpeakingHomeworkFor()
    const vali = await prisma.student.create({ data: { firstName: 'Vali', lastName: 'K', dob: new Date('2014-01-01') } })
    const family = await prisma.family.create({ data: {} })
    await prisma.student.updateMany({ where: { id: { in: [ali.id, vali.id] } }, data: { familyId: family.id } })
    await prisma.telegramLink.create({ data: { chatId, studentId: vali.id } })
    return { group, ali, vali }
  }

  async function seedSpeakingHomeworkFor() {
    const { group, student } = await seedAcademicStructure()
    await prisma.group.update({ where: { id: group.id }, data: { homeworkSubmissionEnabled: true } })
    await prisma.lessonSession.create({
      data: { groupId: group.id, teacherId: group.teacherId, date: new Date('2026-09-27'), topic: 'Speaking', homework: { create: { instructions: 'Talk' } } },
    })
    return { group, student }
  }

  it("shows a shared phone every sibling, and lets it choose whose messages the bot takes", async () => {
    const { ali, vali } = await seedSiblings('680')
    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate(textUpdate(680, '/menu'))

    const menu = calls.find((c) => c.method === 'sendMessage' && String(c.payload.text).includes('bir nechta oʻquvchiga'))!
    expect(String(menu.payload.text)).toContain('• Ali K')
    expect(String(menu.payload.text)).toContain('• Vali K')
    const buttons = (menu.payload.reply_markup as { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> }).inline_keyboard.flat()
    expect(buttons.filter((b) => b.callback_data)).toEqual([
      { text: '✍️ Ali', callback_data: `student:${ali.id}` },
      { text: '✅ Vali', callback_data: `student:${vali.id}` },
    ])

    // A message goes to the chosen child's teacher, and says whose it is.
    await bot.handleUpdate(callbackUpdate(680, `student:${ali.id}`))
    expect((await prisma.telegramLink.findUniqueOrThrow({ where: { chatId: '680' } })).studentId).toBe(ali.id)
    expect(calls.some((c) => c.method === 'answerCallbackQuery' && String(c.payload.text).includes('Ali K uchun'))).toBe(true)
    expect(calls.some((c) => c.method === 'editMessageText')).toBe(true)

    await bot.handleUpdate(textUpdate(680, 'Ali bugun kelolmaydi'))
    const thread = await prisma.conversation.findUniqueOrThrow({ where: { studentId: ali.id }, include: { messages: true } })
    expect(thread.messages.map((m) => m.text)).toEqual(['Ali bugun kelolmaydi'])
    expect(sentText(calls, 'oʻquvchi: <b>Ali K</b>')).toBe(true)

    // Someone else's student can't be chosen.
    const stranger = await prisma.student.create({ data: { firstName: 'Zed', lastName: 'Z', dob: new Date('2012-01-01') } })
    await bot.handleUpdate(callbackUpdate(680, `student:${stranger.id}`))
    expect((await prisma.telegramLink.findUniqueOrThrow({ where: { chatId: '680' } })).studentId).toBe(ali.id)
  })

  it("hands a shared phone's homework to the one sibling whose group takes it, naming them", async () => {
    const { ali } = await seedSiblings('681')
    const { bot, calls } = buildBot({ fileStore: keepingStore, homeworkReceiptDelayMs: 0 })
    await bot.init()
    // The phone last chose Vali, but only Ali's group takes homework through the bot.
    await bot.handleUpdate(photoUpdate(681, 'photo-sib'))
    await new Promise((resolve) => setTimeout(resolve, 50))

    const submission = await prisma.homeworkSubmission.findFirstOrThrow()
    expect(submission.studentId).toBe(ali.id)
    const receipt = calls.find((c) => c.method === 'sendMessage' && String(c.payload.text).includes('qabul qilindi'))!
    expect(String(receipt.payload.text)).toContain('Oʻquvchi: <b>Ali K</b>')
  })

  it('tells an unlinked chat to send its code on /start', async () => {
    const { bot, calls } = buildBot()
    await bot.init()
    await bot.handleUpdate(textUpdate(555, '/start'))
    expect(sentText(calls, 'kodini yuboring')).toBe(true)
    expect(webAppUrls(calls)).toHaveLength(0)
  })
})
