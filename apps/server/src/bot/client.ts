import { Bot, session } from 'grammy'
import type { UserFromGetMe } from 'grammy/types'
import { prisma } from '@tashkurgan/db'
import { calculateAttendanceRate, getProgress, redeemLinkingCode, type Timeframe } from '@tashkurgan/domain'
import type { BotContext, SessionData } from './types'
import {
  childSelectionKeyboard,
  lessonListKeyboard,
  parentKeyboard,
  parentMenu,
  progressTimeframeKeyboard,
  studentKeyboard,
  studentMenu,
  studiesActionsKeyboard,
} from './keyboards'
import * as fmt from './format'

// A student browses one screen of past lessons at a time (newest first) rather than a single
// unbounded list -- a group running for a year could otherwise have hundreds of rows.
const LESSONS_PAGE_SIZE = 8

async function resolveUser(chatId: string) {
  return prisma.user.findUnique({
    where: { telegramChatId: chatId },
    include: { student: true, parent: true },
  })
}

type ResolvedUser = NonNullable<Awaited<ReturnType<typeof resolveUser>>>

async function getActiveChildren(parentId: string) {
  return prisma.parentStudentLink.findMany({
    where: { parentId, unlinkedAt: null },
    include: { student: true },
  })
}

async function sendMainMenu(ctx: BotContext, user: ResolvedUser) {
  if (user.role === 'STUDENT' && user.student) {
    await ctx.reply(`Xush kelibsiz, ${user.student.firstName}! 👋\nQuyidagi menyudan tanlang.`, {
      reply_markup: studentKeyboard,
    })
    return
  }

  if (user.role === 'PARENT' && user.parent) {
    await ctx.reply(`Xush kelibsiz, ${user.parent.fullName}! 👋\nQuyidagi menyudan tanlang.`, {
      reply_markup: parentKeyboard,
    })
    const children = await getActiveChildren(user.parent.id)
    if (children.length === 1) {
      ctx.session.selectedStudentId = children[0].studentId
    }
    return
  }

  await ctx.reply(
    "Hozircha bu bot faqat oʻquvchi va ota-onalar uchun moʻljallangan. Boshqaruv panelidan foydalaning.",
  )
}

async function sendStudies(ctx: BotContext, studentId: string) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, status: 'ACTIVE' },
    include: { group: { include: { level: true, teacher: true } } },
  })
  if (!enrollment) {
    await ctx.reply(fmt.formatNoActiveGroup())
    return
  }
  const lastSession = await prisma.lessonSession.findFirst({
    where: { groupId: enrollment.groupId },
    orderBy: { date: 'desc' },
  })
  await ctx.reply(fmt.formatStudies(enrollment.group, lastSession), {
    parse_mode: 'HTML',
    reply_markup: studiesActionsKeyboard(),
  })
}

/**
 * The "📚 Barcha darslar" browsing flow: every past lesson of the student's currently active
 * group, newest first, each reopening its own materials/homework (not just the latest one) --
 * this is the "relearn a specific past lesson" path §14/§15 describe but the rest of the bot
 * doesn't otherwise expose.
 */
async function sendLessonList(ctx: BotContext, studentId: string, page: number, edit = false) {
  const enrollment = await prisma.enrollment.findFirst({ where: { studentId, status: 'ACTIVE' } })
  if (!enrollment) {
    await ctx.reply(fmt.formatNoActiveGroup())
    return
  }

  const where = { groupId: enrollment.groupId, date: { lte: new Date() } }
  const [sessions, total] = await Promise.all([
    prisma.lessonSession.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: page * LESSONS_PAGE_SIZE,
      take: LESSONS_PAGE_SIZE,
    }),
    prisma.lessonSession.count({ where }),
  ])

  const text = fmt.formatLessonListHeader(total > 0)
  const reply_markup = lessonListKeyboard(sessions, page, (page + 1) * LESSONS_PAGE_SIZE < total)

  if (edit) {
    try {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup })
      return
    } catch {
      // Falls through to a fresh message if there was nothing to edit.
    }
  }
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup })
}

/** Re-verifies the session's group is one the student is (or was) actually enrolled in --
 * `sessionId` comes from user-controlled callback data, so this can't just trust the caller. */
async function sendLessonDetail(ctx: BotContext, studentId: string, sessionId: string) {
  const session = await prisma.lessonSession.findUnique({
    where: { id: sessionId },
    include: { materials: true, homework: { include: { results: { where: { studentId } } } } },
  })
  if (!session) {
    await ctx.reply(fmt.formatLessonNotFound())
    return
  }

  const everEnrolled = await prisma.enrollment.findFirst({ where: { studentId, groupId: session.groupId } })
  if (!everEnrolled) {
    await ctx.reply(fmt.formatLessonNotFound())
    return
  }

  await ctx.reply(fmt.formatLessonDetail(session, session.homework), { parse_mode: 'HTML' })
}

async function sendProgress(ctx: BotContext, studentId: string, kind: 'today' | 'week' | 'month', edit = false) {
  const timeframe: Timeframe = { kind }
  const snapshot = await getProgress(studentId, timeframe)
  const text = fmt.formatProgress(snapshot)
  const reply_markup = progressTimeframeKeyboard()

  if (edit) {
    try {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup })
      return
    } catch {
      // Falls through to a fresh message if there was nothing to edit
      // (e.g. the original message is too old for Telegram to edit).
    }
  }
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup })
}

async function sendHomework(ctx: BotContext, studentId: string) {
  const enrollment = await prisma.enrollment.findFirst({ where: { studentId, status: 'ACTIVE' } })
  if (!enrollment) {
    await ctx.reply(fmt.formatNoActiveGroup())
    return
  }

  const session_ = await prisma.lessonSession.findFirst({
    where: { groupId: enrollment.groupId, homework: { isNot: null } },
    orderBy: { date: 'desc' },
    include: { homework: { include: { results: { where: { studentId } } } } },
  })
  if (!session_?.homework) {
    await ctx.reply(fmt.formatNoHomework())
    return
  }

  await ctx.reply(fmt.formatHomework(session_.homework, session_.homework.results[0]), { parse_mode: 'HTML' })
}

async function sendAttendance(ctx: BotContext, studentId: string) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const records = await prisma.attendance.findMany({
    where: { studentId, lessonSession: { date: { gte: monthStart, lte: now } } },
    include: { lessonSession: true },
    orderBy: { lessonSession: { date: 'desc' } },
  })
  const rate = calculateAttendanceRate(records.map((r) => r.status))
  await ctx.reply(fmt.formatAttendance(records, rate), { parse_mode: 'HTML' })
}

async function sendProfile(ctx: BotContext, studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } })
  if (!student) return
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, status: 'ACTIVE' },
    include: { group: { include: { level: true, teacher: true } } },
  })
  await ctx.reply(fmt.formatProfile(student, enrollment?.group ?? null), { parse_mode: 'HTML' })
}

async function handleStudentMenuText(ctx: BotContext, studentId: string, text: string) {
  switch (text) {
    case studentMenu.studies:
      return sendStudies(ctx, studentId)
    case studentMenu.progress:
      return sendProgress(ctx, studentId, 'month')
    case studentMenu.homework:
      return sendHomework(ctx, studentId)
    case studentMenu.attendance:
      return sendAttendance(ctx, studentId)
    case studentMenu.profile:
      return sendProfile(ctx, studentId)
    default:
      return ctx.reply('Iltimos, quyidagi menyudan tanlang.')
  }
}

async function handleParentMenuText(ctx: BotContext, parentId: string, text: string) {
  if (text === parentMenu.children) {
    const children = await getActiveChildren(parentId)
    if (children.length === 0) {
      await ctx.reply("Sizga hali farzand bogʻlanmagan. Administratorga murojaat qiling.")
      return
    }
    const keyboard = childSelectionKeyboard(
      children.map((c) => ({ studentId: c.studentId, label: `${c.student.firstName} ${c.student.lastName}` })),
    )
    await ctx.reply('Farzandingizni tanlang:', { reply_markup: keyboard })
    return
  }

  const studentId = ctx.session.selectedStudentId
  if (!studentId) {
    await ctx.reply(`Iltimos, avval "${parentMenu.children}" tugmasi orqali farzandingizni tanlang.`)
    return
  }

  // Defense in depth: re-verify the link is still active before showing
  // anything, even though the button that got us here already implied it.
  const link = await prisma.parentStudentLink.findFirst({ where: { parentId, studentId, unlinkedAt: null } })
  if (!link) {
    ctx.session.selectedStudentId = undefined
    await ctx.reply("Ushbu farzandga kirish huquqingiz yoʻq. Administratorga murojaat qiling.")
    return
  }

  switch (text) {
    case parentMenu.studies:
      return sendStudies(ctx, studentId)
    case parentMenu.progress:
      return sendProgress(ctx, studentId, 'month')
    case parentMenu.homework:
      return sendHomework(ctx, studentId)
    case parentMenu.attendance:
      return sendAttendance(ctx, studentId)
    default:
      return ctx.reply('Iltimos, quyidagi menyudan tanlang.')
  }
}

/**
 * `botInfo` lets tests skip the real getMe network call on construction --
 * production always fetches it live (the default when omitted).
 */
export function createBot(token: string, botInfo?: UserFromGetMe) {
  const bot = new Bot<BotContext>(token, botInfo ? { botInfo } : undefined)
  bot.use(session({ initial: (): SessionData => ({}) }))

  bot.command('start', async (ctx) => {
    const chatId = String(ctx.chat.id)
    const user = await resolveUser(chatId)
    if (user) {
      await sendMainMenu(ctx, user)
      return
    }
    await ctx.reply(
      "Assalomu alaykum! 👋\nTashkurgan Academy botiga xush kelibsiz.\n\nDavom etish uchun administrator sizga bergan kodni yuboring.",
    )
  })

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return

    const chatId = String(ctx.chat.id)
    const text = ctx.message.text.trim()
    const user = await resolveUser(chatId)

    if (!user) {
      try {
        await redeemLinkingCode(text.toUpperCase(), chatId)
      } catch {
        await ctx.reply(
          "❌ Kod notoʻgʻri, muddati oʻtgan yoki allaqachon ishlatilgan.\nIltimos, administratordan yangi kod soʻrang.",
        )
        return
      }
      const linked = await resolveUser(chatId)
      await ctx.reply('✅ Hisobingiz muvaffaqiyatli ulandi!')
      if (linked) await sendMainMenu(ctx, linked)
      return
    }

    if (user.role === 'STUDENT' && user.student) {
      await handleStudentMenuText(ctx, user.student.id, text)
    } else if (user.role === 'PARENT' && user.parent) {
      await handleParentMenuText(ctx, user.parent.id, text)
    } else {
      await ctx.reply("Hozircha bu bot faqat oʻquvchi va ota-onalar uchun moʻljallangan.")
    }
  })

  bot.on('callback_query:data', async (ctx) => {
    const chatId = ctx.chat?.id
    const data = ctx.callbackQuery.data
    const user = chatId ? await resolveUser(String(chatId)) : null

    if (!user) {
      await ctx.answerCallbackQuery()
      return
    }

    if (data.startsWith('child:') && user.role === 'PARENT' && user.parent) {
      const studentId = data.slice('child:'.length)
      const link = await prisma.parentStudentLink.findFirst({
        where: { parentId: user.parent.id, studentId, unlinkedAt: null },
        include: { student: true },
      })
      if (!link) {
        await ctx.answerCallbackQuery({ text: 'Ruxsat yoʻq' })
        return
      }
      ctx.session.selectedStudentId = studentId
      await ctx.answerCallbackQuery()
      await ctx.reply(`Endi <b>${link.student.firstName}</b> maʼlumotlarini koʻrishingiz mumkin.`, {
        parse_mode: 'HTML',
      })
      return
    }

    if (data.startsWith('progress:')) {
      const kind = data.slice('progress:'.length) as 'today' | 'week' | 'month'
      let studentId: string | undefined
      if (user.role === 'STUDENT') studentId = user.student?.id
      else if (user.role === 'PARENT') studentId = ctx.session.selectedStudentId

      await ctx.answerCallbackQuery()
      if (!studentId) return
      await sendProgress(ctx, studentId, kind, true)
      return
    }

    if (data.startsWith('lessons:')) {
      const page = Number(data.slice('lessons:'.length)) || 0
      let studentId: string | undefined
      if (user.role === 'STUDENT') studentId = user.student?.id
      else if (user.role === 'PARENT') studentId = ctx.session.selectedStudentId

      await ctx.answerCallbackQuery()
      if (!studentId) return
      // Always triggered by tapping a button on an existing message (the "Barcha darslar"
      // action or a previous page) -- edit it in place, same as sendProgress's callback path.
      await sendLessonList(ctx, studentId, page, true)
      return
    }

    if (data.startsWith('lesson:')) {
      const sessionId = data.slice('lesson:'.length)
      let studentId: string | undefined
      if (user.role === 'STUDENT') studentId = user.student?.id
      else if (user.role === 'PARENT') studentId = ctx.session.selectedStudentId

      await ctx.answerCallbackQuery()
      if (!studentId) return
      await sendLessonDetail(ctx, studentId, sessionId)
      return
    }

    await ctx.answerCallbackQuery()
  })

  bot.catch((err) => {
    console.error('Telegram bot error:', err)
  })

  return bot
}
