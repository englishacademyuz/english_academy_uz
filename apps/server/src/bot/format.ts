// Text for the notifications-only bot. Everything a student browses lives in the Mini App.
export function formatWelcome(): string {
  return "Assalomu alaykum! 👋\nUMID EDU botiga xush kelibsiz.\n\nDavom etish uchun administrator bergan oʻquvchi kodini yuboring. Oʻquvchi ham, ota-onasi ham bir xil koddan foydalanadi."
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

Kerakli boʻlimni oching.
💬 Oʻqituvchiga savolingiz boʻlsa, shu yerga yozing.`
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

function formatSum(amount: number): string {
  return `${amount.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} soʻm`
}

/**
 * "Your payment day is coming / has come / has passed" -- a friendly nudge until five days past
 * the payment day, then a firmer one: the student counts as a debtor from then on.
 */
export function formatPaymentReminder(reminder: {
  studentName: string
  stage: 'upcoming' | 'due' | 'overdue' | 'debtor'
  dueDate: string
  daysLeft: number
  unpaidCycles: number
  amount: number
}): string {
  const day = formatLessonDay(new Date(reminder.dueDate))
  const headline = {
    upcoming: `🔔 <b>${reminder.daysLeft} kundan soʻng toʻlov kuni</b>`,
    due: '🔔 <b>Bugun toʻlov kuni</b>',
    overdue: `⏰ <b>Toʻlov kuni ${-reminder.daysLeft} kun oldin oʻtdi</b>`,
    debtor: '❗️ <b>Toʻlov kechiktirilmoqda</b>',
  }[reminder.stage]
  const ask = {
    upcoming: 'Iltimos, keyingi oy uchun toʻlovni oʻz vaqtida tayyorlab qoʻying.',
    due: 'Iltimos, bugun kelgusi oy uchun toʻlovni amalga oshiring yoki markazga olib keling.',
    overdue: 'Iltimos, toʻlovni imkon qadar tezroq amalga oshiring yoki markazga olib keling.',
    debtor: `Toʻlov kunidan ${-reminder.daysLeft} kun oʻtdi — hisobingizda qarzdorlik bor. Iltimos, toʻlovni zudlik bilan amalga oshiring.`,
  }[reminder.stage]
  return [
    headline,
    `Oʻquvchi: <b>${escapeHtml(reminder.studentName)}</b>`,
    '',
    `📅 Toʻlov kuni: ${day}`,
    ...(reminder.amount > 0 ? [`💰 Summa: <b>${formatSum(reminder.amount)}</b>`] : []),
    ...(reminder.unpaidCycles > 1 ? [`Toʻlanmagan oylar: ${reminder.unpaidCycles} ta`] : []),
    '',
    ask,
  ].join('\n')
}

/** "The student didn't come to today's lesson" -- sent when the teacher presses the button. */
export function formatAbsenceNotice(absence: { studentName: string; groupName: string; date: Date }): string {
  return [
    '❗️ <b>Oʻquvchi darsga kelmadi</b>',
    `Oʻquvchi: <b>${escapeHtml(absence.studentName)}</b>`,
    `Guruh: ${escapeHtml(absence.groupName)}`,
    '',
    `📅 ${formatLessonDay(absence.date)}`,
    '',
    'Iltimos, sababini oʻqituvchiga yoki markazga maʼlum qiling.',
  ].join('\n')
}

/** A teacher's (or admin's) answer in the family chat, delivered to every chat linked to the student. */
export function formatStaffMessage(message: { studentName: string; senderName: string; text: string }): string {
  return [
    '💬 <b>Oʻqituvchidan xabar</b>',
    `👤 ${escapeHtml(message.senderName)} · Oʻquvchi: ${escapeHtml(message.studentName)}`,
    '',
    escapeHtml(message.text),
    '',
    '<i>Javob berish uchun shu yerga yozing.</i>',
  ].join('\n')
}

/** Confirms the first of a run of family messages reached the teacher. */
export function formatChatDelivered(): string {
  return "✅ Xabaringiz oʻqituvchiga yuborildi. Javob shu chatga keladi.\n\nYana biror narsa qoʻshmoqchi boʻlsangiz, shu yerga yozavering."
}

export function formatChatTextOnly(): string {
  return "Hozircha oʻqituvchiga faqat matnli xabar yuborish mumkin. Savolingizni yozib yuboring ✍️"
}

export function formatChatTooLong(max: number): string {
  return `Xabar juda uzun. Iltimos, ${max} belgidan qisqaroq qilib yozing yoki bir necha qismga boʻlib yuboring.`
}

/** Sent once the files a chat just sent are in -- an album gets one receipt, not one per photo. */
export function formatHomeworkReceived(receipt: { date: Date; topic: string | null; photoCount: number; voiceCount: number }): string {
  return [
    '📥 <b>Uyga vazifa qabul qilindi</b>',
    `📅 ${formatLessonDay(receipt.date)}${receipt.topic ? ` · ${escapeHtml(receipt.topic)}` : ''}`,
    ...(receipt.photoCount ? [`🖼 Rasmlar: ${receipt.photoCount} ta`] : []),
    ...(receipt.voiceCount ? [`🎤 Ovozli xabarlar: ${receipt.voiceCount} ta`] : []),
    '',
    'Ustoz tekshirgach, natija shu yerga keladi. Yuborganlaringizni ilovada koʻrish yoki oʻchirish mumkin.',
  ].join('\n')
}

export function formatNoOpenHomework(): string {
  return "Hozir topshiriladigan uyga vazifa yoʻq 🙂\nRasm va ovozli xabar faqat ustoz bergan vazifa uchun qabul qilinadi."
}

export function formatTooManyHomeworkPhotos(max: number): string {
  return `Bitta vazifaga koʻpi bilan ${max} ta rasm yuborish mumkin. Keraksizlarini ilovada oʻchirib, keyin qayta yuboring.`
}

export function formatTooManyHomeworkVoices(max: number): string {
  return `Bitta vazifaga koʻpi bilan ${max} ta ovozli xabar yuborish mumkin. Keraksizlarini ilovada oʻchirib, keyin qayta yuboring.`
}

export function formatHomeworkAudioTooBig(): string {
  return 'Bu fayl juda katta (20 MB dan ortiq). Iltimos, uni ovozli xabar qilib yozib yuboring 🎤'
}

export function formatHomeworkReview(review: {
  studentName: string
  date: Date
  topic: string | null
  status: 'CHECKED' | 'RETURNED'
  comment: string | null
}): string {
  return [
    review.status === 'CHECKED' ? '✅ <b>Uyga vazifa tekshirildi</b>' : '🔁 <b>Uyga vazifani qayta ishlash kerak</b>',
    `Oʻquvchi: <b>${escapeHtml(review.studentName)}</b>`,
    `📅 ${formatLessonDay(review.date)}${review.topic ? ` · ${escapeHtml(review.topic)}` : ''}`,
    ...(review.comment ? ['', `💬 Ustoz: ${escapeHtml(review.comment)}`] : []),
    ...(review.status === 'RETURNED' ? ['', 'Xatolarni tuzatib, rasmlarni qaytadan yuboring.'] : []),
  ].join('\n')
}
