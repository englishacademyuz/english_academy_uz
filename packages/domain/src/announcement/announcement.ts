import { prisma, type AnnouncementKind, type Prisma } from '@tashkurgan/db'
import { NotFoundError, ValidationError } from '@tashkurgan/shared'
import type { Actor } from '../identity/actor'
import { assertCan } from '../identity/authorize'
import { groupRecipients } from '../identity/family'
import type { StoredPhoto } from '../homework/submission'

/**
 * Announcements: news, an event or an organizational notice (e.g. collecting for a new
 * whiteboard) that staff send to some or all groups. The groups' students see it at the top
 * of the Mini App's home screen, and their Telegram chats are sent it. Deleting one takes it
 * out of the app; the route also takes back the Telegram messages it went out as.
 */

export const MAX_ANNOUNCEMENT_TITLE = 120

/** Longest text -- with the title, it still fits one Telegram message (4096 characters). */
export const MAX_ANNOUNCEMENT_BODY = 2000

/** How long news and notices stay on the home screen; an event stays until it has happened. */
const HOME_DAYS = 14
const HOME_LIMIT = 3
/** An event is still on the home screen for a few hours after it starts. */
const EVENT_GRACE_MS = 6 * 60 * 60 * 1000

export type AnnouncementInput = {
  kind: AnnouncementKind
  title: string
  body: string
  /** EVENT only: when it happens. */
  eventAt?: Date | null
  /** ORGANIZATIONAL only: what each family is asked to bring, in so'm. */
  amount?: number | null
  groupIds: string[]
}

const VIEW = {
  id: true,
  kind: true,
  title: true,
  body: true,
  eventAt: true,
  amount: true,
  imageFileId: true,
  imageWidth: true,
  imageHeight: true,
  authorName: true,
  createdAt: true,
} satisfies Prisma.AnnouncementSelect

type Row = Prisma.AnnouncementGetPayload<{ select: typeof VIEW }>

/** An announcement as staff and the Mini App see it -- whether it has a picture, never Telegram's file id. */
function view({ imageFileId, imageWidth, imageHeight, ...rest }: Row) {
  return { ...rest, image: imageFileId ? { width: imageWidth, height: imageHeight } : null }
}

/**
 * Checks an announcement before anything is uploaded: the text, the kind's own field, and that
 * the caller may send to every group. Returns it cleaned up -- what `createAnnouncement` takes.
 */
export async function prepareAnnouncement(actor: Actor, input: AnnouncementInput): Promise<AnnouncementInput> {
  const title = input.title.trim()
  const body = input.body.trim()
  if (!title) throw new ValidationError('Title is required')
  if (title.length > MAX_ANNOUNCEMENT_TITLE) throw new ValidationError('Title is too long')
  if (!body) throw new ValidationError('Text is required')
  if (body.length > MAX_ANNOUNCEMENT_BODY) throw new ValidationError('Text is too long')
  if (input.kind === 'EVENT' && !input.eventAt) throw new ValidationError('An event needs a date and time')
  const amount = input.kind === 'ORGANIZATIONAL' ? input.amount ?? null : null
  if (amount !== null && (!Number.isInteger(amount) || amount <= 0)) {
    throw new ValidationError('Amount must be a whole number above 0')
  }

  const groupIds = [...new Set(input.groupIds)]
  if (groupIds.length === 0) throw new ValidationError('Choose at least one group')
  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds }, archivedAt: null },
    select: { teacherId: true },
  })
  if (groups.length !== groupIds.length) throw new NotFoundError('Group not found')
  assertCan(actor, { resource: 'announcement', action: 'publish', groupTeacherIds: groups.map((g) => g.teacherId) })

  return {
    kind: input.kind,
    title,
    body,
    eventAt: input.kind === 'EVENT' ? input.eventAt : null,
    amount,
    groupIds,
  }
}

async function authorName(actor: Actor): Promise<string> {
  if (actor.teacherId) {
    const teacher = await prisma.teacher.findUnique({ where: { id: actor.teacherId }, select: { fullName: true } })
    if (teacher) return teacher.fullName
  }
  return 'Administratsiya'
}

/** Saves an announcement `prepareAnnouncement` checked, with its picture if one was uploaded. */
export async function createAnnouncement(actor: Actor, input: AnnouncementInput, image: StoredPhoto | null) {
  const row = await prisma.announcement.create({
    data: {
      kind: input.kind,
      title: input.title,
      body: input.body,
      eventAt: input.eventAt ?? null,
      amount: input.amount ?? null,
      imageFileId: image?.fileId ?? null,
      imageFileUniqueId: image?.fileUniqueId ?? null,
      imageWidth: image?.width ?? null,
      imageHeight: image?.height ?? null,
      authorUserId: actor.userId,
      authorName: await authorName(actor),
      groups: { create: input.groupIds.map((groupId) => ({ groupId })) },
    },
    select: VIEW,
  })
  return { ...view(row), imageFileId: row.imageFileId }
}

/** Every Telegram chat of the groups' current students (siblings' shared phones included), once each. */
export async function announcementChatIds(groupIds: string[]): Promise<string[]> {
  const recipients = await Promise.all(groupIds.map((id) => groupRecipients(id)))
  return [...new Set(recipients.flat().map((r) => r.chatId))]
}

/** Keeps the Telegram messages an announcement went out as. False if it was deleted meanwhile -- take them back. */
export async function recordAnnouncementMessages(announcementId: string, messages: Array<{ chatId: string; messageId: number }>) {
  const exists = await prisma.announcement.count({ where: { id: announcementId } })
  if (!exists) return false
  await prisma.announcementMessage.createMany({
    data: messages.map((m) => ({ announcementId, ...m })),
    skipDuplicates: true,
  })
  return true
}

/** Where a staff member's announcements are: all for an Admin; a Teacher's own and any to their groups. */
function visibleToStaff(actor: Actor): Prisma.AnnouncementWhereInput {
  if (actor.role === 'ADMIN') return {}
  return {
    OR: [{ authorUserId: actor.userId }, { groups: { some: { group: { teacherId: actor.teacherId ?? '' } } } }],
  }
}

/** The panel's list, newest first, with the groups each went to and whether the caller may delete it. */
export async function listAnnouncementsForStaff(actor: Actor) {
  const rows = await prisma.announcement.findMany({
    where: visibleToStaff(actor),
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      ...VIEW,
      authorUserId: true,
      groups: { select: { group: { select: { id: true, name: true, level: { select: { color: true } } } } } },
      _count: { select: { messages: true } },
    },
  })
  return rows.map(({ authorUserId, groups, _count, ...row }) => ({
    ...view(row),
    groups: groups
      .map(({ group }) => ({ id: group.id, name: group.name, levelColor: group.level.color }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    sentMessages: _count.messages,
    canDelete: actor.role === 'ADMIN' || authorUserId === actor.userId,
  }))
}

/** The picture's Telegram file id, for a staff member who can see the announcement. */
export async function announcementImageForStaff(actor: Actor, id: string) {
  const row = await prisma.announcement.findFirst({ where: { id, ...visibleToStaff(actor) }, select: { imageFileId: true } })
  if (!row?.imageFileId) throw new NotFoundError('Image not found')
  return row.imageFileId
}

/**
 * Deletes an announcement (its author, or an Admin) and hands back the Telegram messages it
 * went out as, so the caller can take them back out of the chats.
 */
export async function deleteAnnouncement(actor: Actor, id: string) {
  const row = await prisma.announcement.findUnique({
    where: { id },
    select: { authorUserId: true, messages: { select: { chatId: true, messageId: true } } },
  })
  if (!row) throw new NotFoundError('Announcement not found')
  assertCan(actor, { resource: 'announcement', action: 'delete', authorUserId: row.authorUserId })
  await prisma.announcement.delete({ where: { id } })
  return row.messages
}

/** Announcements to a group the student is in now. */
const forStudent = (studentId: string): Prisma.AnnouncementWhereInput => ({
  groups: { some: { group: { enrollments: { some: { studentId, status: 'ACTIVE' } } } } },
})

/**
 * What the Mini App shows: `home` is the newest few still worth a place on the home screen --
 * news and notices from the last two weeks, events until they have happened; otherwise all of them.
 */
export async function listAnnouncementsForStudent(studentId: string, options: { home?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date()
  const fresh: Prisma.AnnouncementWhereInput = {
    OR: [
      { eventAt: { gte: new Date(now.getTime() - EVENT_GRACE_MS) } },
      { eventAt: null, createdAt: { gte: new Date(now.getTime() - HOME_DAYS * 24 * 60 * 60 * 1000) } },
    ],
  }
  const rows = await prisma.announcement.findMany({
    where: options.home ? { AND: [forStudent(studentId), fresh] } : forStudent(studentId),
    orderBy: { createdAt: 'desc' },
    take: options.home ? HOME_LIMIT : 50,
    select: VIEW,
  })
  return rows.map(view)
}

async function findForStudent(studentId: string, id: string) {
  const row = await prisma.announcement.findFirst({ where: { id, ...forStudent(studentId) }, select: VIEW })
  if (!row) throw new NotFoundError('Announcement not found')
  return row
}

/** One announcement to a group the student is in now. */
export async function studentAnnouncement(studentId: string, id: string) {
  return view(await findForStudent(studentId, id))
}

/** The picture's Telegram file id, for a student the announcement went to. */
export async function studentAnnouncementImage(studentId: string, id: string) {
  const { imageFileId } = await findForStudent(studentId, id)
  if (!imageFileId) throw new NotFoundError('Image not found')
  return imageFileId
}
