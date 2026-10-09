import { prisma, type Student } from '@tashkurgan/db'
import { ConflictError, NotFoundError, ValidationError } from '@tashkurgan/shared'

/**
 * Siblings who share one phone. An admin ties them into a Family; from then on
 * a Telegram chat linked to any of them may open every one of them (the Mini
 * App asks whose account to open first), and each one's notifications reach
 * all the family's chats, headed with their name -- so a parent never has to
 * redeem a second code to switch between children.
 */

/** "2 or 3 children" in practice; a cap keeps a mistaken tie from sweeping in half a group. */
export const MAX_FAMILY_SIZE = 5

const byName = (a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }) =>
  a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName)

/** The student and their tied siblings (just the student when they aren't in a family). */
export async function familyStudentIds(studentId: string): Promise<string[]> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { familyId: true } })
  if (!student?.familyId) return [studentId]
  const members = await prisma.student.findMany({ where: { familyId: student.familyId }, select: { id: true } })
  return members.map((m) => m.id)
}

/** Every Telegram chat that may open the student -- their own, their parents', and those linked to a tied sibling. */
export async function studentChatIds(studentId: string): Promise<string[]> {
  const links = await prisma.telegramLink.findMany({
    where: { studentId: { in: await familyStudentIds(studentId) } },
    select: { chatId: true },
  })
  return links.map((l) => l.chatId)
}

/** A chat to notify, and whose news it is -- a family chat gets one message naming every sibling it concerns. */
export type Recipient = { chatId: string; studentNames: string[] }

/** The chats of the given students (siblings' chats included), each once with the names of the students it's for. */
async function recipientsFor(students: Array<{ id: string; firstName: string; lastName: string; familyId: string | null }>) {
  const familyIds = [...new Set(students.flatMap((s) => (s.familyId ? [s.familyId] : [])))]
  const members = familyIds.length
    ? await prisma.student.findMany({ where: { familyId: { in: familyIds } }, select: { id: true, familyId: true } })
    : []
  const membersOf = new Map<string, string[]>()
  for (const m of members) membersOf.set(m.familyId!, [...(membersOf.get(m.familyId!) ?? []), m.id])

  const links = await prisma.telegramLink.findMany({
    where: { studentId: { in: [...new Set([...students.map((s) => s.id), ...members.map((m) => m.id)])] } },
    select: { chatId: true, studentId: true },
    orderBy: { chatId: 'asc' },
  })
  const chatsOf = new Map<string, string[]>()
  for (const l of links) chatsOf.set(l.studentId, [...(chatsOf.get(l.studentId) ?? []), l.chatId])

  const namesByChat = new Map<string, string[]>()
  for (const s of [...students].sort(byName)) {
    const name = `${s.firstName} ${s.lastName}`
    for (const id of s.familyId ? membersOf.get(s.familyId) ?? [s.id] : [s.id]) {
      for (const chatId of chatsOf.get(id) ?? []) {
        const names = namesByChat.get(chatId) ?? []
        if (!names.includes(name)) namesByChat.set(chatId, [...names, name])
      }
    }
  }
  return [...namesByChat].map(([chatId, studentNames]): Recipient => ({ chatId, studentNames }))
}

/** Every chat (student, parent or a sibling's) of a student currently in the group. */
export async function groupRecipients(groupId: string): Promise<Recipient[]> {
  const students = await prisma.student.findMany({
    where: { enrollments: { some: { groupId, status: 'ACTIVE' } } },
    select: { id: true, firstName: true, lastName: true, familyId: true },
  })
  return recipientsFor(students)
}

/**
 * What a chat may open: the student it's linked to (`current` -- the last one it chose) and,
 * when that student is in a family, every sibling too, by name. Null for an unlinked chat.
 */
export async function chatAccess(chatId: string): Promise<{ current: Student; students: Student[] } | null> {
  const link = await prisma.telegramLink.findUnique({ where: { chatId }, include: { student: true } })
  if (!link) return null
  const students = link.student.familyId
    ? await prisma.student.findMany({ where: { familyId: link.student.familyId } })
    : [link.student]
  return { current: link.student, students: students.sort(byName) }
}

/** Points the chat at one of the students it may open -- the bot then hands homework and messages to them. */
export async function chooseChatStudent(chatId: string, studentId: string) {
  const access = await chatAccess(chatId)
  const student = access?.students.find((s) => s.id === studentId)
  if (!student) throw new NotFoundError('Student not found')
  if (access!.current.id !== studentId) {
    await prisma.telegramLink.update({ where: { chatId }, data: { studentId } })
  }
  return student
}

/** A student's tied siblings, for the panel. */
export async function getFamily(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { familyId: true } })
  if (!student) throw new NotFoundError('Student not found')
  if (!student.familyId) return { familyId: null, students: [] }
  const students = await prisma.student.findMany({
    where: { familyId: student.familyId },
    select: { id: true, firstName: true, lastName: true, status: true },
  })
  return { familyId: student.familyId, students: students.sort(byName) }
}

/** Ties `otherId` (and any siblings already tied to them) into the student's family, starting one if needed. */
export async function tieStudents(studentId: string, otherId: string) {
  if (studentId === otherId) throw new ValidationError('A student cannot be tied to themselves')
  const pair = await prisma.student.findMany({ where: { id: { in: [studentId, otherId] } }, select: { id: true, familyId: true } })
  if (pair.length !== 2) throw new NotFoundError('Student not found')
  const familyIds = [...new Set(pair.flatMap((s) => (s.familyId ? [s.familyId] : [])))]

  await prisma.$transaction(async (tx) => {
    const members = await tx.student.findMany({
      where: { OR: [{ id: { in: [studentId, otherId] } }, ...(familyIds.length ? [{ familyId: { in: familyIds } }] : [])] },
      select: { id: true },
    })
    if (members.length > MAX_FAMILY_SIZE) throw new ConflictError('FAMILY_TOO_BIG')
    // Keep the student's own family when they have one, so its id stays put.
    const target = pair.find((s) => s.id === studentId)!.familyId ?? familyIds[0] ?? (await tx.family.create({ data: {} })).id
    await tx.student.updateMany({ where: { id: { in: members.map((m) => m.id) } }, data: { familyId: target } })
    await tx.family.deleteMany({ where: { id: { in: familyIds.filter((id) => id !== target) } } })
  })
  return getFamily(studentId)
}

/**
 * Takes the student out of their family. Each chat keeps the student it last chose (and only
 * them, from then on); a family left with one student is dissolved.
 */
export async function untieStudent(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { familyId: true } })
  if (!student) throw new NotFoundError('Student not found')
  if (!student.familyId) return
  const familyId = student.familyId

  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id: studentId }, data: { familyId: null } })
    const rest = await tx.student.findMany({ where: { familyId }, select: { id: true } })
    if (rest.length < 2) {
      await tx.student.updateMany({ where: { familyId }, data: { familyId: null } })
      await tx.family.delete({ where: { id: familyId } })
    }
  })
}

/**
 * Before a student is deleted: chats pointed at them move to a sibling, so the family's phones
 * keep the other children (their links would otherwise go with the student).
 */
export async function handOverChats(studentId: string) {
  const siblings = (await familyStudentIds(studentId)).filter((id) => id !== studentId)
  if (siblings.length === 0) return
  await prisma.telegramLink.updateMany({ where: { studentId }, data: { studentId: siblings[0] } })
}
