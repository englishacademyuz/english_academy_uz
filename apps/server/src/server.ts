import { buildApp } from './app'
import { config } from './config'
import { createBot } from './bot/client'

const app = await buildApp()

app.listen({ port: config.port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})

// Long polling for now (no public HTTPS URL to receive webhooks in local
// dev/this environment). Swapping to bot.api.setWebhook() + mounting
// bot.webhookCallback() as a Fastify route is a small change later, per
// docs/ARCHITECTURE.md §6 -- the handler logic itself doesn't change.
if (config.telegramBotToken) {
  const bot = createBot(config.telegramBotToken)
  bot.start()
  app.log.info('Telegram bot started (long polling)')
} else {
  app.log.warn('TELEGRAM_BOT_TOKEN not set -- Telegram bot not started')
}
