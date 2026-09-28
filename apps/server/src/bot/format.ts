// Text for the notifications-only bot. Everything a student browses lives in the Mini App.
export function formatWelcome(): string {
  return "Assalomu alaykum! 👋\nTashkurgan Academy botiga xush kelibsiz.\n\nDavom etish uchun administrator bergan oʻquvchi kodini yuboring. Oʻquvchi ham, ota-onasi ham bir xil koddan foydalanadi."
}

export function formatCodeNotFound(): string {
  return "❌ Bunday kod topilmadi. Kodni tekshirib, qaytadan yuboring yoki administratordan yangi kod soʻrang."
}

export function formatCodeExpired(): string {
  return "⌛ Bu kodning muddati tugagan (kod 24 soat amal qiladi). Administratordan yangi kod soʻrang."
}

export function formatCodeFailed(): string {
  return "⚠️ Kodni tekshirishda xatolik yuz berdi. Birozdan soʻng qayta urinib koʻring."
}

/** Teacher-typed text goes into HTML-mode messages, so it must not be able to break the markup. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// The center is in Uzbekistan, but the server may run in UTC -- deadlines are
// always shown in the center's local time.
const DEADLINE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tashkent',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDeadline(date: Date): string {
  const parts = Object.fromEntries(DEADLINE_FORMAT.formatToParts(date).map((p) => [p.type, p.value]))
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`
}

export function formatQuizAnnouncement(quiz: {
  title: string
  questionCount: number
  maxPoints: number
  deadline: Date
}): string {
  return [
    `🧠 <b>Yangi test: ${escapeHtml(quiz.title)}</b>`,
    '',
    `Savollar: ${quiz.questionCount} · Maksimal ball: ${quiz.maxPoints}`,
    `Muddat: ${formatDeadline(quiz.deadline)} gacha`,
    '',
    'Faqat bitta urinish beriladi. Tayyor boʻlsangiz, boshlang.',
  ].join('\n')
}

export function formatMenu(studentName: string): string {
  return `👋 Xush kelibsiz!
Siz <b>${escapeHtml(studentName)}</b> maʼlumotlarini koʻryapsiz.

Kerakli boʻlimni oching:`
}

export function formatMiniAppUnavailable(): string {
  return "Ilova hozircha sozlanmagan. Birozdan soʻng qayta urinib koʻring."
}

const UZ_WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
]

/** A lesson day (stored as UTC midnight) as "Payshanba, 2-oktabr". */
export function formatLessonDay(date: Date): string {
  return `${UZ_WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()}-${UZ_MONTHS[date.getUTCMonth()]}`
}

export function formatLessonChange(change: {
  groupName: string
  kind: 'moved' | 'restored'
  originalDate: Date
  regularTime: string
  newDate: Date
  newTime: string
  reason: string | null
}): string {
  if (change.kind === 'restored') {
    return [
      `🔁 <b>Dars joyiga qaytdi</b>`,
      `Guruh: <b>${escapeHtml(change.groupName)}</b>`,
      '',
      `Avval koʻchirilgan dars bekor qilindi. Dars odatdagidek boʻladi:`,
      `✅ ${formatLessonDay(change.originalDate)}, soat ${change.regularTime}`,
    ].join('\n')
  }
  return [
    `📅 <b>Dars vaqti oʻzgardi</b>`,
    `Guruh: <b>${escapeHtml(change.groupName)}</b>`,
    '',
    `❌ <s>${formatLessonDay(change.originalDate)}, soat ${change.regularTime}</s>`,
    `✅ <b>${formatLessonDay(change.newDate)}, soat ${change.newTime}</b>`,
    ...(change.reason ? ['', `Sabab: ${escapeHtml(change.reason)}`] : []),
  ].join('\n')
}
