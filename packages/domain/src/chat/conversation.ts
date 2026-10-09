import { prisma, type Prisma } from '@tashkurgan/db'
import { NotFoundError, ValidationError } from '@tashkurgan/shared'
import type { Actor } from '../identity/actor'
import { assertCan } from '../identity/authorize'
import { studentChatIds } from '../identity/family'

/**
 * "Oʻqituvchi bilan muloqot": one Conversation per Student between their family
 * (every Telegram chat linked to the Student -- in practice mostly parents) and
 * staff. Families write from the bot or the Mini App; the group's Teacher or an
 * Admin answers from the panel, and the answer is delivered to every linked chat.
 */

/** Longest message accepted from either side -- well under Telegram's 4096-character limit. */
export const CHAT_MESSAGE_MAX_LENGTH = 2000

/** How many of the newest messages a thread returns. */
const THREAD_LIMIT = 200

function cleanText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) throw new ValidationError('Message is empty')
  if (trimmed.length > CHAT_MESSAGE_MAX_LENGTH) throw new ValidationError('Message is too long')
  return trimmed
}

/** Conversations a staff member may see: all for an Admin, a Teacher's current students otherwise. */
function visibleTo(actor: Actor): Prisma.ConversationWhereInput {
  if (actor.role === 'ADMIN') return {}
  return { student: { enrollments: { some: { status: 'ACTIVE', group: { teacherId: actor.teacherId ?? '' } } } } }
}

/** Only the Teacher of one of the student's current groups (or an Admin) may read or answer their family. */
async function assertCanChatWith(actor: Actor, studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      firstName: true,
      lastName: true,
      enrollments: { where: { status: 'ACTIVE' }, select: { group: { select: { teacherId: true } } } },
    },
  })
  if (!student) throw new NotFoundError('Student not found')
  assertCan(actor, { resource: 'conversation', action: 'manage', ownerTeacherIds: student.enrollments.map((e) => e.group.teacherId) })
  return student
}

async function staffName(actor: Actor): Promise<string> {
  if (actor.teacherId) {
    const teacher = await prisma.teacher.findUnique({ where: { id: actor.teacherId }, select: { fullName: true } })
    if (teacher) return teacher.fullName
  }
  return 'Administrator'
}

async function markStaffRead(conversationId: string, userId: string, at: Date = new Date()) {
  await prisma.conversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, readAt: at },
    update: { readAt: at },
  })
}

/**
 * A message from one of the student's linked Telegram chats (bot or Mini App).
 * `startsTurn` is true when staff hasn't heard from the family since their last
 * answer (or ever) -- the bot confirms delivery only then, not on every line.
 */
export async function postFamilyMessage(input: { studentId: string; chatId: string; senderName: string; text: string }) {
  const text = cleanText(input.text)
  const now = new Date()
  const conversation = await prisma.conversation.upsert({
    where: { studentId: input.studentId },
    create: { studentId: input.studentId, lastMessageAt: now, lastFamilyMessageAt: now, familyReadAt: now },
    // Writing in the thread means they've seen what came before.
    update: { lastMessageAt: now, lastFamilyMessageAt: now, familyReadAt: now },
  })
  const previous = await prisma.chatMessage.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    select: { sender: true },
  })
  const message = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      sender: 'FAMILY',
      text,
      senderChatId: input.chatId,
      senderName: input.senderName.trim() || 'Ota-ona',
      createdAt: now,
    },
  })
  return { message, startsTurn: previous?.sender !== 'FAMILY' }
}

/** A Teacher's or Admin's answer. The caller delivers it to `chatIds` (every chat that may open the student). */
export async function postStaffMessage(actor: Actor, studentId: string, rawText: string) {
  const student = await assertCanChatWith(actor, studentId)
  const text = cleanText(rawText)
  const chatIds = await studentChatIds(studentId)
  if (chatIds.length === 0) throw new ValidationError('The student has no linked Telegram account')

  const now = new Date()
  const conversation = await prisma.conversation.upsert({
    where: { studentId },
    create: { studentId, lastMessageAt: now },
    update: { lastMessageAt: now },
  })
  const message = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      sender: 'STAFF',
      text,
      senderUserId: actor.userId,
      senderName: await staffName(actor),
      createdAt: now,
    },
  })
  // Answering a thread means having read it.
  await markStaffRead(conversation.id, actor.userId, now)
  return { message, chatIds, studentName: `${student.firstName} ${student.lastName}` }
}

const studentCard = {
  id: true,
  firstName: true,
  lastName: true,
  dob: true,
  phone: true,
  status: true,
  enrollments: {
    where: { status: 'ACTIVE' as const },
    select: {
      group: {
        select: { id: true, name: true, level: { select: { name: true, color: true } }, teacher: { select: { fullName: true } } },
      },
    },
  },
} satisfies Prisma.StudentSelect

type StudentCardRow = Prisma.StudentGetPayload<{ select: typeof studentCard }>

function toStudentCard(student: StudentCardRow) {
  const { enrollments, ...rest } = student
  return {
    ...rest,
    groups: enrollments.map(({ group }) => ({
      id: group.id,
      name: group.name,
      level: group.level.name,
      levelColor: group.level.color,
      teacher: group.teacher.fullName,
    })),
  }
}

/** The panel's conversation list, newest first, with this staff member's own unread count on each. */
export async function listConversations(actor: Actor) {
  const conversations = await prisma.conversation.findMany({
    where: visibleTo(actor),
    orderBy: { lastMessageAt: 'desc' },
    include: {
      student: { select: studentCard },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      reads: { where: { userId: actor.userId } },
    },
  })

  // Only threads with something new need counting -- usually a handful.
  const unreadCounts = await Promise.all(
    conversations.map((c) => {
      const readAt = c.reads[0]?.readAt
      if (!c.lastFamilyMessageAt || (readAt && c.lastFamilyMessageAt <= readAt)) return 0
      return prisma.chatMessage.count({
        where: { conversationId: c.id, sender: 'FAMILY', ...(readAt ? { createdAt: { gt: readAt } } : {}) },
      })
    }),
  )

  return conversations.map((c, i) => {
    const last = c.messages[0]
    return {
      studentId: c.studentId,
      student: toStudentCard(c.student),
      lastMessage: last ? { sender: last.sender, senderName: last.senderName, text: last.text, createdAt: last.createdAt } : null,
      lastMessageAt: c.lastMessageAt,
      unread: unreadCounts[i],
    }
  })
}

/** What the panel's chat button polls: how much is unread, and the newest unread message (for a toast). */
export async function unreadSummary(actor: Actor) {
  const unread = (await listConversations(actor)).filter((c) => c.unread > 0)
  const newest = unread
    .filter((c) => c.lastMessage?.sender === 'FAMILY')
    .sort((a, b) => b.lastMessage!.createdAt.getTime() - a.lastMessage!.createdAt.getTime())[0]
  return {
    conversations: unread.length,
    messages: unread.reduce((sum, c) => sum + c.unread, 0),
    latest: newest
      ? {
          studentId: newest.studentId,
          studentName: `${newest.student.firstName} ${newest.student.lastName}`,
          senderName: newest.lastMessage!.senderName,
          text: newest.lastMessage!.text,
          createdAt: newest.lastMessage!.createdAt,
        }
      : null,
  }
}

/** One student's thread for the panel -- opening it marks it read for this staff member. */
export async function getStaffThread(actor: Actor, studentId: string) {
  await assertCanChatWith(actor, studentId)
  const [student, conversation, linkedChats] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: studentCard }),
    prisma.conversation.findUnique({
      where: { studentId },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: THREAD_LIMIT } },
    }),
    studentChatIds(studentId).then((chats) => chats.length),
  ])
  if (conversation) await markStaffRead(conversation.id, actor.userId)

  return {
    student: toStudentCard(student),
    linkedChats,
    familyReadAt: conversation?.familyReadAt ?? null,
    messages: (conversation?.messages ?? []).reverse().map((m) => ({
      id: m.id,
      sender: m.sender,
      senderName: m.senderName,
      text: m.text,
      createdAt: m.createdAt,
    })),
  }
}

/**
 * The thread as the family sees it in the Mini App -- opening it marks staff messages seen.
 * Chat ids never leave the server: a message is flagged `mine` when this chat wrote it.
 */
export async function getFamilyThread(studentId: string, chatId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { studentId },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: THREAD_LIMIT } },
  })
  if (conversation) {
    await prisma.conversation.update({ where: { id: conversation.id }, data: { familyReadAt: new Date() } })
  }
  return (conversation?.messages ?? []).reverse().map((m) => ({
    id: m.id,
    fromFamily: m.sender === 'FAMILY',
    mine: m.sender === 'FAMILY' && m.senderChatId === chatId,
    senderName: m.senderName,
    text: m.text,
    createdAt: m.createdAt,
  }))
}

/** Staff messages the family hasn't opened in the Mini App yet. */
export async function familyUnreadCount(studentId: string): Promise<number> {
  const conversation = await prisma.conversation.findUnique({ where: { studentId }, select: { id: true, familyReadAt: true } })
  if (!conversation) return 0
  return prisma.chatMessage.count({
    where: {
      conversationId: conversation.id,
      sender: 'STAFF',
      ...(conversation.familyReadAt ? { createdAt: { gt: conversation.familyReadAt } } : {}),
    },
  })
}
