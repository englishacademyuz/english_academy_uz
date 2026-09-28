import { finalizeExpiredAttempts } from '@tashkurgan/domain'
import { buildApp } from './app'
import { config } from './config'
import { announceQuiz, createBot } from './bot/client'

// Long polling for now (no public HTTPS URL to receive webhooks in local
// dev/this environment). Swapping to bot.api.setWebhook() + mounting
// bot.webhookCallback() as a Fastify route is a small change later, per
// docs/ARCHITECTURE.md §6 -- the handler logic itself doesn't change.
const bot = config.telegramBotToken ? createBot(config.telegramBotToken, { miniAppUrl: config.miniAppUrl }) : null

const app = await buildApp({
  quizNotifier: bot ? (chatIds, quiz) => announceQuiz(bot, config.miniAppUrl, chatIds, quiz) : undefined,
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
