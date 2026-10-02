import { Api } from 'grammy'
import { finalizeExpiredAttempts } from '@tashkurgan/domain'
import { telegramFileStore } from './telegram/fileStore'
import { buildApp } from './app'
import { config } from './config'
import {
  announceAbsence,
  announceHomeworkReview,
  announceLessonChange,
  announcePaymentReminder,
  announceQuiz,
  announceStaffMessage,
  createBot,
} from './bot/client'

// Long polling for now (no public HTTPS URL to receive webhooks in local
// dev/this environment). Swapping to bot.api.setWebhook() + mounting
// bot.webhookCallback() as a Fastify route is a small change later, per
// docs/ARCHITECTURE.md §6 -- the handler logic itself doesn't change.
// Homework photos are kept on Telegram (see telegram/fileStore.ts), so the store needs the bot.
const fileStore = config.telegramBotToken
  ? telegramFileStore(new Api(config.telegramBotToken), config.telegramBotToken, config.telegramStorageChatId)
  : undefined
const bot = config.telegramBotToken
  ? createBot(config.telegramBotToken, { miniAppUrl: config.miniAppUrl, fileStore })
  : null

const app = await buildApp({
  quizNotifier: bot ? (chatIds, quiz) => announceQuiz(bot, config.miniAppUrl, chatIds, quiz) : undefined,
  lessonChangeNotifier: bot
    ? (chatIds, change) => announceLessonChange(bot, config.miniAppUrl, chatIds, change)
    : undefined,
  paymentReminderNotifier: bot
    ? (chatIds, reminder) => announcePaymentReminder(bot, config.miniAppUrl, chatIds, reminder)
    : undefined,
  absenceNotifier: bot ? (chatIds, absence) => announceAbsence(bot, config.miniAppUrl, chatIds, absence) : undefined,
  chatNotifier: bot ? (chatIds, message) => announceStaffMessage(bot, config.miniAppUrl, chatIds, message) : undefined,
  homeworkReviewNotifier: bot
    ? (chatIds, review) => announceHomeworkReview(bot, config.miniAppUrl, chatIds, review)
    : undefined,
  homeworkFileStore: fileStore,
})

app.listen({ port: config.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})

if (bot) {
  bot.start()
  app.log.info('Telegram bot started (long polling)')
  // The chat's menu button opens the Mini App from anywhere in the chat, and (unlike a
  // reply-keyboard button) passes the signed init data the Mini App authenticates with.
  bot.api
    .setChatMenuButton({ menu_button: { type: 'web_app', text: 'Ilova', web_app: { url: config.miniAppUrl } } })
    .catch((err) => app.log.error({ err }, 'Setting the Mini App menu button failed'))
} else {
  app.log.warn('TELEGRAM_BOT_TOKEN not set -- Telegram bot not started')
}

// Scores attempts left unfinished when a quiz's deadline passes, so their points
// land on time even if nobody opens the quiz again. Reads also do this lazily.
const QUIZ_SWEEP_MS = 60_000
setInterval(() => {
  finalizeExpiredAttempts().catch((err) => app.log.error({ err }, 'Quiz deadline sweep failed'))
}, QUIZ_SWEEP_MS)
