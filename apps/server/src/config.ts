function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var ${name}`)
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // The production admin-web origins are always allowed (the old domain too, until nothing uses
  // it); WEB_ORIGIN adds more.
  webOrigin: [
    'https://umid-edu.up.railway.app',
    'https://tashkurganadmin-web-production.up.railway.app',
    ...(process.env.WEB_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? [
      'http://localhost:5173',
      'http://localhost:5174',
    ]),
  ],
  // Optional: the server runs fine without a bot (e.g. under the test
  // suite's .env.test), it just doesn't start one.
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  // Optional: a private channel (bot as admin) that keeps a copy of every homework photo.
  // Without it, photos uploaded in the Mini App are posted in the uploader's own chat with the bot.
  telegramStorageChatId: process.env.TELEGRAM_STORAGE_CHAT_ID || undefined,
  // HTTPS base URL of the student Telegram Mini App (served by admin-web under /student).
  miniAppUrl: (
    process.env.MINI_APP_URL ?? 'https://umid-edu.up.railway.app/student'
  ).replace(/\/+$/, ''),
}
