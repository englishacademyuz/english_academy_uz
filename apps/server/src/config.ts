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
  // The production admin-web origin is always allowed; WEB_ORIGIN adds more.
  webOrigin: [
    'https://tashkurganadmin-web-production.up.railway.app',
    ...(process.env.WEB_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? [
      'http://localhost:5173',
      'http://localhost:5174',
    ]),
  ],
  // Optional: the server runs fine without a bot (e.g. under the test
  // suite's .env.test), it just doesn't start one.
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
}
