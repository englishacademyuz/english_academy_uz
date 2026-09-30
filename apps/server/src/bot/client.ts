import { Bot } from 'grammy'
import type { UserFromGetMe } from 'grammy/types'
import { prisma } from '@tashkurgan/db'
import { looksLikeLinkingCode, redeemLinkingCode } from '@tashkurgan/domain'
import { ConflictError, NotFoundError } from '@tashkurgan/shared'
import type { QuizAnnouncement } from '../routes/quizzes'
import type { PaymentReminderAnnouncement } from '../routes/payments'
import type { LessonChangeAnnouncement } from '../routes/schedule'
import type { BotContext } from './types'
import { miniAppMenuKeyboard, openHomeKeyboard, openMiniAppKeyboard, quizStartKeyboard } from './keyboards'
import * as fmt from './format'

/**
 * The bot is for linking and notifications; everything a student (or parent)
 * browses -- lessons, homework, progress, attendance, quizzes -- is in the
 * Telegram Mini App at `miniAppUrl`.
 */
export type BotOptions = {
  /** Lets tests skip the real getMe network call -- production always fetches it live. */
  botInfo?: UserFromGetMe
  /** HTTPS base URL of the student Mini App (e.g. https://…/student). */
  miniAppUrl?: string
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

export function createBot(token: string, options: BotOptions = {}) {
  const { botInfo, miniAppUrl } = options
  const bot = new Bot<BotContext>(token, botInfo ? { botInfo } : undefined)

  bot.command('start', async (ctx) => {
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

    // Anything else -- including a tap on the old reply keyboard -- gets the Mini App menu.
    await sendMenu(ctx, student, miniAppUrl)
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
