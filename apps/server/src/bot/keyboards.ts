import { InlineKeyboard, Keyboard } from 'grammy'
import { formatDate } from './format'

export const studentMenu = {
  studies: "📚 Mening oʻqishim",
  progress: '📊 Progressim',
  homework: '📝 Uy vazifasi',
  attendance: '✅ Davomat',
  profile: '👤 Profilim',
} as const

export const parentMenu = {
  children: '👨‍👩‍👧 Farzandlarim',
  studies: "📚 Oʻqishi",
  progress: '📊 Progressi',
  homework: '📝 Uy vazifasi',
  attendance: '✅ Davomat',
} as const

export const studentKeyboard = new Keyboard()
  .text(studentMenu.studies)
  .text(studentMenu.progress)
  .row()
  .text(studentMenu.homework)
  .text(studentMenu.attendance)
  .row()
  .text(studentMenu.profile)
  .resized()

export const parentKeyboard = new Keyboard()
  .text(parentMenu.children)
  .row()
  .text(parentMenu.studies)
  .text(parentMenu.progress)
  .row()
  .text(parentMenu.homework)
  .text(parentMenu.attendance)
  .resized()

export function progressTimeframeKeyboard() {
  return new InlineKeyboard()
    .text('Bugun', 'progress:today')
    .text('Shu hafta', 'progress:week')
    .text('Shu oy', 'progress:month')
}

export function childSelectionKeyboard(children: Array<{ studentId: string; label: string }>) {
  const keyboard = new InlineKeyboard()
  for (const child of children) {
    keyboard.text(child.label, `child:${child.studentId}`).row()
  }
  return keyboard
}

export function studiesActionsKeyboard() {
  return new InlineKeyboard().text('📚 Barcha darslar', 'lessons:0')
}

/** One button per past lesson (newest first), plus prev/next paging when the group has more
 * lessons than fit on one screen -- tapping a lesson reopens its own materials/homework. */
export function lessonListKeyboard(
  sessions: Array<{ id: string; date: Date; topic: string | null }>,
  page: number,
  hasMore: boolean,
) {
  const keyboard = new InlineKeyboard()
  for (const session of sessions) {
    const label = `${formatDate(session.date)} — ${session.topic ?? 'Mavzu kiritilmagan'}`
    keyboard.text(label.length > 64 ? `${label.slice(0, 63)}…` : label, `lesson:${session.id}`).row()
  }
  if (page > 0) keyboard.text('◀ Oldingi', `lessons:${page - 1}`)
  if (hasMore) keyboard.text('Keyingi ▶', `lessons:${page + 1}`)
  return keyboard
}
