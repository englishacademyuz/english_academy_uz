import { InlineKeyboard, Keyboard } from 'grammy'

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
