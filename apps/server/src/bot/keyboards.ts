import { InlineKeyboard } from 'grammy'

/**
 * Mini App sections the bot links to. Only inline `web_app` buttons (and the
 * chat menu button) hand the Mini App the signed init data the server
 * authenticates with -- reply-keyboard web_app buttons don't, so the old
 * reply keyboard is gone.
 */
export const MINI_APP_SECTIONS = [
  { path: '/lessons', label: '📚 Oʻqish' },
  { path: '/homework', label: '📝 Vazifa' },
  { path: '/progress', label: '📊 Progress' },
  { path: '/attendance', label: '✅ Davomat' },
  { path: '/quizzes', label: '🧠 Testlar' },
  { path: '/profile', label: '👤 Profil' },
] as const

export function miniAppMenuKeyboard(miniAppUrl: string) {
  const keyboard = new InlineKeyboard().webApp('🏠 Ilovani ochish', miniAppUrl).row()
  MINI_APP_SECTIONS.forEach((section, i) => {
    keyboard.webApp(section.label, `${miniAppUrl}${section.path}`)
    if (i % 2 === 1) keyboard.row()
  })
  return keyboard
}

export function quizStartKeyboard(miniAppUrl: string, quizId: string) {
  return new InlineKeyboard().webApp('▶️ Boshlash', `${miniAppUrl}/quizzes/${quizId}`)
}
