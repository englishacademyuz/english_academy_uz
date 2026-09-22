import type {
  Attendance,
  Group,
  Homework,
  HomeworkResult,
  Level,
  LessonMaterial,
  LessonSession,
  Student,
  Teacher,
} from '@tashkurgan/db'
import type { ProgressSnapshot, Timeframe } from '@tashkurgan/domain'

const MATERIAL_TYPE_LABEL: Record<string, string> = {
  PDF: 'PDF',
  DOCUMENT: 'Hujjat',
  IMAGE: 'Rasm',
  VIDEO: 'Video',
  AUDIO: 'Audio',
  LINK: 'Havola',
  TEXT: 'Matn',
}

const STUDENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Faol',
  PAUSED: "Toʻxtatilgan",
  INACTIVE: 'Nofaol',
  COMPLETED: 'Tugallagan',
  LEFT: 'Ketgan',
}

const ATTENDANCE_LABEL: Record<string, string> = {
  PRESENT: '✅ Bor',
  LATE: '🟡 Kechikdi',
  ABSENT: '❌ Yoʻq',
  EXCUSED: '⚪ Sababli',
}

const TIMEFRAME_LABEL: Record<Timeframe['kind'], string> = {
  today: 'Bugun',
  week: 'Shu hafta',
  month: 'Shu oy',
  sinceEnrollment: 'Guruhga qoʻshilgandan beri',
  course: 'Kurs davomida',
  custom: 'Tanlangan davr',
}

export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${date.getFullYear()}`
}

function pct(value: number | null): string {
  return value === null ? "Maʼlumot yoʻq" : `${value.toFixed(0)}%`
}

type GroupWithLevelAndTeacher = Group & { level: Level; teacher: Teacher }

export function formatStudies(group: GroupWithLevelAndTeacher, lastSession: LessonSession | null): string {
  const lines = [
    `📚 <b>Mening oʻqishim</b>`,
    '',
    `Guruh: <b>${group.name}</b>`,
    `Daraja: ${group.level.name}`,
    `Oʻqituvchi: ${group.teacher.fullName}`,
    `Dars kunlari: ${group.scheduleDays.join('/')}, soat ${group.scheduleTime}`,
  ]
  if (lastSession) {
    lines.push('', `📖 Oxirgi mavzu (${formatDate(lastSession.date)}):`, lastSession.topic ?? '—')
  }
  return lines.join('\n')
}

export function formatNoActiveGroup(): string {
  return "Hozircha faol guruhga yozilmagansiz. Administrator bilan bogʻlaning."
}

export function formatProgress(snapshot: ProgressSnapshot): string {
  const lines = [
    `📊 <b>Progress</b> — ${TIMEFRAME_LABEL[snapshot.timeframe.kind]}`,
    '',
    `✅ Davomat: ${pct(snapshot.attendanceRate)}`,
    `📝 Uy vazifasi: ${pct(snapshot.homeworkRate)}`,
  ]
  const categories = Object.entries(snapshot.academicByCategory)
  if (categories.length > 0) {
    lines.push('', '📈 Fanlar boʻyicha oʻrtacha baho:')
    for (const [name, value] of categories) {
      lines.push(`  • ${name}: ${value.toFixed(0)}%`)
    }
  }
  return lines.join('\n')
}

export function formatNoHomework(): string {
  return "Hozircha uy vazifasi topilmadi."
}

export function formatHomework(homework: Homework, result: HomeworkResult | undefined): string {
  const lines = [`📝 <b>Uy vazifasi</b>`, '', homework.instructions]
  if (homework.dueDate) lines.push('', `Muddat: ${formatDate(homework.dueDate)}`)
  lines.push('')
  if (!result) {
    lines.push('Holat: <i>Hali tekshirilmagan</i>')
  } else {
    lines.push(`Holat: ${result.status === 'COMPLETED' ? '✅ Bajarilgan' : '❌ Bajarilmagan'}`)
    if (result.score !== null) lines.push(`Ball: <b>${result.score}</b>`)
  }
  return lines.join('\n')
}

export function formatAttendance(
  records: Array<Attendance & { lessonSession: LessonSession }>,
  rate: number | null,
): string {
  const lines = [`✅ <b>Davomat</b> — shu oy`, '', `Umumiy koʻrsatkich: ${pct(rate)}`, '']
  if (records.length === 0) {
    lines.push('Hali davomat qayd etilmagan.')
  } else {
    for (const record of records.slice(0, 10)) {
      lines.push(`${formatDate(record.lessonSession.date)} — ${ATTENDANCE_LABEL[record.status] ?? record.status}`)
    }
  }
  return lines.join('\n')
}

export function formatLessonListHeader(hasAny: boolean): string {
  return hasAny
    ? '📚 <b>Darslar tarixi</b>\n\nOʻtilgan darsni tanlab, uning materiallari va uy vazifasini qayta koʻrishingiz mumkin:'
    : '📚 <b>Darslar tarixi</b>\n\nHali oʻtilgan dars qayd etilmagan.'
}

export function formatLessonNotFound(): string {
  return "Bu dars topilmadi yoki unga kirish huquqingiz yoʻq."
}

export function formatLessonDetail(
  session: LessonSession & { materials: LessonMaterial[] },
  homework: (Homework & { results: HomeworkResult[] }) | null,
): string {
  const lines = [`📖 <b>${formatDate(session.date)}</b>`, '']
  lines.push(session.topic ? `Mavzu: <b>${session.topic}</b>` : 'Mavzu kiritilmagan')
  if (session.notes) lines.push('', session.notes)

  if (homework) {
    lines.push('', '📝 <b>Uy vazifasi:</b>', homework.instructions)
    const result = homework.results[0]
    if (result) {
      lines.push(`Holat: ${result.status === 'COMPLETED' ? '✅ Bajarilgan' : '❌ Bajarilmagan'}`)
      if (result.score !== null) lines.push(`Ball: <b>${result.score}</b>`)
    }
  }

  if (session.materials.length > 0) {
    lines.push('', '📎 <b>Materiallar:</b>')
    for (const material of session.materials) {
      lines.push(`• ${MATERIAL_TYPE_LABEL[material.type] ?? material.type}: ${material.content}`)
    }
  }

  return lines.join('\n')
}

export function formatProfile(student: Student, group: GroupWithLevelAndTeacher | null): string {
  const lines = [
    `👤 <b>Profilim</b>`,
    '',
    `Ism: <b>${student.firstName} ${student.lastName}</b>`,
    `Holat: ${STUDENT_STATUS_LABEL[student.status] ?? student.status}`,
  ]
  if (group) {
    lines.push(`Guruh: ${group.name}`, `Daraja: ${group.level.name}`, `Oʻqituvchi: ${group.teacher.fullName}`)
  }
  return lines.join('\n')
}
