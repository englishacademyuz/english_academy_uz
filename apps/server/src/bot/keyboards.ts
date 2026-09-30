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

export const CHAT_BUTTON_LABEL = '💬 Oʻqituvchi bilan muloqot'

export function miniAppMenuKeyboard(miniAppUrl: string) {
  const keyboard = new InlineKeyboard().webApp('🏠 Ilovani ochish', miniAppUrl).row()
  MINI_APP_SECTIONS.forEach((section, i) => {
    keyboard.webApp(section.label, `${miniAppUrl}${section.path}`)
    if (i % 2 === 1) keyboard.row()
  })
  return keyboard.webApp(CHAT_BUTTON_LABEL, `${miniAppUrl}/chat`)
}

/**
 * Labels of reply-keyboard buttons from the old text-based bot (and the section labels above) --
 * a tap on one still in someone's chat brings up the menu instead of becoming a message to the teacher.
 */
export const MENU_LABELS = new Set<string>([
  ...MINI_APP_SECTIONS.map((s) => s.label),
  CHAT_BUTTON_LABEL,
  '📚 Mening oʻqishim',
  '📊 Progressim',
  '📝 Uy vazifasi',
  '✅ Davomat',
  '👤 Profilim',
  '👨‍👩‍👧 Farzandlarim',
  '📚 Oʻqishi',
  '📊 Progressi',
])

export function quizStartKeyboard(miniAppUrl: string, quizId: string) {
  return new InlineKeyboard().webApp('▶️ Boshlash', `${miniAppUrl}/quizzes/${quizId}`)
}

export function openMiniAppKeyboard(miniAppUrl: string) {
  return new InlineKeyboard().webApp('📚 Ilovani ochish', `${miniAppUrl}/lessons`)
}

export function openHomeKeyboard(miniAppUrl: string) {
  return new InlineKeyboard().webApp('🏠 Ilovani ochish', miniAppUrl)
}

export function openChatKeyboard(miniAppUrl: string) {
  return new InlineKeyboard().webApp('💬 Suhbatni ochish', `${miniAppUrl}/chat`)
}
