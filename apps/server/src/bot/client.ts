import { Bot } from 'grammy'
import type { UserFromGetMe } from 'grammy/types'
import { prisma } from '@tashkurgan/db'
import {
  addHomeworkPhoto,
  addHomeworkVoice,
  CHAT_MESSAGE_MAX_LENGTH,
  latestOpenHomework,
  looksLikeLinkingCode,
  MAX_HOMEWORK_PHOTOS,
  MAX_HOMEWORK_VOICES,
  postFamilyMessage,
  redeemLinkingCode,
  type StoredPhoto,
  type StoredVoice,
} from '@tashkurgan/domain'
import { ConflictError, NotFoundError } from '@tashkurgan/shared'
import type { QuizAnnouncement } from '../routes/quizzes'
import type { PaymentReminderAnnouncement } from '../routes/payments'
import type { AbsenceAnnouncement } from '../routes/absences'
import type { LessonChangeAnnouncement } from '../routes/schedule'
import type { StaffMessageAnnouncement } from '../routes/conversations'
import { homeworkPhotoCaption, type HomeworkReviewAnnouncement } from '../routes/homeworkSubmissions'
import { largestPhoto, MAX_DOWNLOAD_BYTES, type HomeworkFileStore } from '../telegram/fileStore'
import { telegramDisplayName } from '../telegram/initData'
import type { BotContext } from './types'
import {
  MENU_LABELS,
  miniAppMenuKeyboard,
  openChatKeyboard,
  openHomeKeyboard,
  openHomeworkKeyboard,
  openMiniAppKeyboard,
  quizStartKeyboard,
} from './keyboards'
import * as fmt from './format'

/**
 * The bot is for linking, notifications and the family chat with the teacher
 * (any other text a linked chat sends is a message to the teacher), plus homework photos
 * and voice notes in groups that take them (each goes to the newest open homework); everything
 * a student (or parent) browses -- lessons, homework, progress, attendance,
 * quizzes -- is in the Telegram Mini App at `miniAppUrl`.
 */
export type BotOptions = {
  /** Lets tests skip the real getMe network call -- production always fetches it live. */
  botInfo?: UserFromGetMe
  /** HTTPS base URL of the student Mini App (e.g. https://…/student). */
  miniAppUrl?: string
  /** Keeps homework photos and voice notes sent to the chat; without it, they're refused like other non-text messages. */
  fileStore?: HomeworkFileStore
  /** How long to wait for the rest of an album before confirming it (tests use 0). */
  homeworkReceiptDelayMs?: number
}

/** Image files sent "as a file" (uncompressed) count as homework photos too. */
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type StudentName = { id: string; firstName: string; lastName: string }

/** The student's current group takes homework through the platform. */
async function takesHomework(studentId: string) {
  const enabled = await prisma.enrollment.count({
    where: { studentId, status: 'ACTIVE', group: { homeworkSubmissionEnabled: true } },
  })
  return enabled > 0
}

/** The student a chat may view -- the only identity the bot has (student and parents alike). */
async function resolveStudent(chatId: string) {
  const link = await prisma.telegramLink.findUnique({ where: { chatId }, include: { student: true } })
  return link?.student ?? null
}

async function sendMenu(ctx: BotContext, student: { firstName: string; lastName: string }, miniAppUrl?: string) {
  if (!miniAppUrl) {
    await ctx.reply(fmt.formatMiniAppUnavailable())
    return
  }
  // Clears the old reply keyboard (📚 📊 📝 …) left over from the text-based bot;
  // a message can't carry both a keyboard removal and inline buttons.
  await ctx.reply('✅', { reply_markup: { remove_keyboard: true } })
  await ctx.reply(fmt.formatMenu(`${student.firstName} ${student.lastName}`), {
    parse_mode: 'HTML',
    reply_markup: miniAppMenuKeyboard(miniAppUrl),
  })
}

/** Links (or re-points) this chat with the code the admin gave the student or parent. */
async function handleLinkingCode(ctx: BotContext, chatId: string, text: string, miniAppUrl?: string) {
  let student
  try {
    student = await redeemLinkingCode(text, chatId)
  } catch (err) {
    if (err instanceof NotFoundError) {
      await ctx.reply(fmt.formatCodeNotFound())
    } else if (err instanceof ConflictError) {
      await ctx.reply(fmt.formatCodeExpired())
    } else {
      console.error('Telegram linking failed:', err)
      await ctx.reply(fmt.formatCodeFailed())
    }
    return
  }
  await ctx.reply('✅ Hisobingiz muvaffaqiyatli ulandi!')
  await sendMenu(ctx, student, miniAppUrl)
}

/** Relays a linked chat's text to the teacher -- confirmed with a reaction, plus a line when a new run of messages starts. */
async function handleFamilyMessage(ctx: BotContext, studentId: string, chatId: string, text: string, miniAppUrl?: string) {
  const { startsTurn } = await postFamilyMessage({
    studentId,
    chatId,
    senderName: ctx.from ? telegramDisplayName(ctx.from) : '',
    text,
  })
  // Reactions are a newer Bot API feature -- a client that can't show one still gets the line below.
  await ctx.react('👌').catch(() => {})
  if (startsTurn) {
    await ctx.reply(fmt.formatChatDelivered(), miniAppUrl ? { reply_markup: openChatKeyboard(miniAppUrl) } : undefined)
  }
}

export function createBot(token: string, options: BotOptions = {}) {
  const { botInfo, miniAppUrl, fileStore, homeworkReceiptDelayMs = 1500 } = options
  const bot = new Bot<BotContext>(token, botInfo ? { botInfo } : undefined)

  // One receipt per run of photos (an album arrives as one message per photo): each new photo
  // pushes the receipt back a little, and it then reports the submission as it stands.
  const pendingReceipts = new Map<string, ReturnType<typeof setTimeout>>()
  function scheduleReceipt(chatId: string, send: () => Promise<unknown>) {
    clearTimeout(pendingReceipts.get(chatId))
    pendingReceipts.set(
      chatId,
      setTimeout(() => {
        pendingReceipts.delete(chatId)
        send().catch((err) => console.error('Homework receipt failed:', err))
      }, homeworkReceiptDelayMs),
    )
  }

  /**
   * Attaches a file a linked chat sent to the student's newest open homework: `attach` stores it
   * (captioned with whose it is) and adds it to the submission. False when their group doesn't
   * take homework through the platform.
   */
  async function handleHomeworkFile(
    ctx: BotContext,
    student: { id: string; firstName: string; lastName: string },
    attach: (store: HomeworkFileStore, lessonId: string, caption: string) => Promise<{ id: string }>,
  ): Promise<boolean> {
    if (!fileStore) return false
    const chatId = String(ctx.chat!.id)
    if (!(await takesHomework(student.id))) return false

    const lesson = await latestOpenHomework(student.id)
    if (!lesson) {
      scheduleReceipt(chatId, () => ctx.reply(fmt.formatNoOpenHomework()))
      return true
    }
    try {
      const submission = await attach(fileStore, lesson.id, homeworkPhotoCaption(student, lesson.date, lesson.topic))
      await ctx.react('👌').catch(() => {})
      scheduleReceipt(chatId, async () => {
        const counts = await prisma.homeworkSubmission.findUnique({
          where: { id: submission.id },
          select: { _count: { select: { photos: true, voices: true } } },
        })
        if (!counts) return
        const receipt = { date: lesson.date, topic: lesson.topic, photoCount: counts._count.photos, voiceCount: counts._count.voices }
        await ctx.reply(fmt.formatHomeworkReceived(receipt), {
          parse_mode: 'HTML',
          ...(miniAppUrl ? { reply_markup: openHomeworkKeyboard(miniAppUrl, lesson.id) } : {}),
        })
      })
    } catch (err) {
      if (err instanceof ConflictError && err.message === 'TOO_MANY_PHOTOS') {
        scheduleReceipt(chatId, () => ctx.reply(fmt.formatTooManyHomeworkPhotos(MAX_HOMEWORK_PHOTOS)))
      } else if (err instanceof ConflictError && err.message === 'TOO_MANY_VOICES') {
        scheduleReceipt(chatId, () => ctx.reply(fmt.formatTooManyHomeworkVoices(MAX_HOMEWORK_VOICES)))
      } else {
        throw err
      }
    }
    return true
  }

  function handleHomeworkPhoto(ctx: BotContext, student: StudentName, photo: StoredPhoto, kind: 'photo' | 'document') {
    return handleHomeworkFile(ctx, student, async (store, lessonId, caption) =>
      addHomeworkPhoto(student.id, lessonId, await store.keep(photo, caption, kind)),
    )
  }

  function handleHomeworkVoice(ctx: BotContext, student: StudentName, voice: StoredVoice, kind: 'voice' | 'audio') {
    return handleHomeworkFile(ctx, student, async (store, lessonId, caption) =>
      addHomeworkVoice(student.id, lessonId, await store.keepVoice(voice, caption, kind)),
    )
  }

  bot.command(['start', 'menu'], async (ctx) => {
    const student = await resolveStudent(String(ctx.chat.id))
    if (student) {
      await sendMenu(ctx, student, miniAppUrl)
      return
    }
    await ctx.reply(fmt.formatWelcome())
  })

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return

    const chatId = String(ctx.chat.id)
    const text = ctx.message.text.trim()
    const student = await resolveStudent(chatId)

    // Unlinked chats can only send a code; linked ones may send another code
    // to switch to a different student (e.g. a parent with two children).
    if (!student || looksLikeLinkingCode(text)) {
      await handleLinkingCode(ctx, chatId, text, miniAppUrl)
      return
    }

    // A tap on a button of the old reply keyboard brings up the Mini App menu.
    if (MENU_LABELS.has(text)) {
      await sendMenu(ctx, student, miniAppUrl)
      return
    }

    // Anything else is a message to the teacher.
    if (text.length > CHAT_MESSAGE_MAX_LENGTH) {
      await ctx.reply(fmt.formatChatTooLong(CHAT_MESSAGE_MAX_LENGTH))
      return
    }
    await handleFamilyMessage(ctx, student.id, chatId, text, miniAppUrl)
  })

  // A photo (or an image sent as a file) is homework, in groups that take it.
  bot.on(['message:photo', 'message:document'], async (ctx, next) => {
    const student = await resolveStudent(String(ctx.chat.id))
    if (!student) return next()
    const { photo, document } = ctx.message
    if (photo?.length) {
      if (await handleHomeworkPhoto(ctx, student, largestPhoto(photo), 'photo')) return
    } else if (document && IMAGE_MIME_TYPES.has(document.mime_type ?? '')) {
      const stored = { fileId: document.file_id, fileUniqueId: document.file_unique_id, size: document.file_size ?? null }
      if (await handleHomeworkPhoto(ctx, student, stored, 'document')) return
    }
    return next()
  })

  // A voice note (or an audio file, e.g. from a recorder app) is speaking homework, in groups that take homework.
  bot.on(['message:voice', 'message:audio'], async (ctx, next) => {
    const student = await resolveStudent(String(ctx.chat.id))
    if (!student) return next()
    const { voice, audio } = ctx.message
    const file = voice ?? audio!
    const stored = { fileId: file.file_id, fileUniqueId: file.file_unique_id, duration: file.duration, size: file.file_size ?? null }
    // Telegram's bots can't download anything bigger, so it could never be played back.
    if ((file.file_size ?? 0) > MAX_DOWNLOAD_BYTES) {
      if (!fileStore || !(await takesHomework(student.id))) return next()
      await ctx.reply(fmt.formatHomeworkAudioTooBig())
      return
    }
    if (await handleHomeworkVoice(ctx, student, stored, voice ? 'voice' : 'audio')) return
    return next()
  })

  // Stickers, videos … (and photos or voice notes, where homework isn't handed in) aren't relayed -- a linked chat is asked to write instead.
  bot.on('message', async (ctx) => {
    if (await resolveStudent(String(ctx.chat.id))) await ctx.reply(fmt.formatChatTextOnly())
  })

  // Buttons on messages from the old text-based bot (lesson lists, chat quizzes, …)
  // no longer do anything themselves; they point the user to the Mini App instead.
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery()
    const student = ctx.chat ? await resolveStudent(String(ctx.chat.id)) : null
    if (student) await sendMenu(ctx, student, miniAppUrl)
  })

  bot.catch((err) => {
    console.error('Telegram bot error:', err)
  })

  return bot
}

/** Sends "a new quiz is open" with a button that opens it in the Mini App; one failed chat (e.g. a blocked bot) doesn't stop the rest. */
export async function announceQuiz(
  bot: Bot<BotContext>,
  miniAppUrl: string,
  chatIds: string[],
  quiz: QuizAnnouncement,
) {
  const text = fmt.formatQuizAnnouncement(quiz)
  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: quizStartKeyboard(miniAppUrl, quiz.quizId),
      })
    } catch (err) {
      console.error(`Quiz announcement to chat ${chatId} failed:`, err)
    }
  }
}

/** Sends "your lesson moved" to every chat of the group; one failed chat doesn't stop the rest. */
export async function announceLessonChange(
  bot: Bot<BotContext>,
  miniAppUrl: string,
  chatIds: string[],
  change: LessonChangeAnnouncement,
) {
  const text = fmt.formatLessonChange(change)
  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...(miniAppUrl ? { reply_markup: openMiniAppKeyboard(miniAppUrl) } : {}),
      })
    } catch (err) {
      console.error(`Lesson change announcement to chat ${chatId} failed:`, err)
    }
  }
}

/** Sends a payment reminder to every chat of the student; one failed chat doesn't stop the rest. */
export async function announcePaymentReminder(
  bot: Bot<BotContext>,
  miniAppUrl: string,
  chatIds: string[],
  reminder: PaymentReminderAnnouncement,
) {
  const text = fmt.formatPaymentReminder(reminder)
  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...(miniAppUrl ? { reply_markup: openHomeKeyboard(miniAppUrl) } : {}),
      })
    } catch (err) {
      console.error(`Payment reminder to chat ${chatId} failed:`, err)
    }
  }
}

/** Tells every chat of the student they missed a lesson; one failed chat doesn't stop the rest. */
export async function announceAbsence(
  bot: Bot<BotContext>,
  miniAppUrl: string,
  chatIds: string[],
  absence: AbsenceAnnouncement,
) {
  const text = fmt.formatAbsenceNotice(absence)
  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...(miniAppUrl ? { reply_markup: openHomeKeyboard(miniAppUrl) } : {}),
      })
    } catch (err) {
      console.error(`Absence notice to chat ${chatId} failed:`, err)
    }
  }
}

/** Delivers a teacher's answer to every chat of the student; one failed chat doesn't stop the rest. */
export async function announceStaffMessage(
  bot: Bot<BotContext>,
  miniAppUrl: string,
  chatIds: string[],
  message: StaffMessageAnnouncement,
) {
  const text = fmt.formatStaffMessage(message)
  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...(miniAppUrl ? { reply_markup: openChatKeyboard(miniAppUrl) } : {}),
      })
    } catch (err) {
      console.error(`Chat message to chat ${chatId} failed:`, err)
    }
  }
}

/** Tells every chat of the student their homework photos were checked or sent back; one failed chat doesn't stop the rest. */
export async function announceHomeworkReview(
  bot: Bot<BotContext>,
  miniAppUrl: string,
  chatIds: string[],
  review: HomeworkReviewAnnouncement,
) {
  const text = fmt.formatHomeworkReview(review)
  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...(miniAppUrl ? { reply_markup: openHomeworkKeyboard(miniAppUrl, review.lessonId) } : {}),
      })
    } catch (err) {
      console.error(`Homework review notice to chat ${chatId} failed:`, err)
    }
  }
}
