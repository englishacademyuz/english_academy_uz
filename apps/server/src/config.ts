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
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  // Optional: the server runs fine without a bot (e.g. under the test
  // suite's .env.test), it just doesn't start one.
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
}
