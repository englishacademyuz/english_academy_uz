import { prisma } from '@tashkurgan/db'
import { ConflictError, NotFoundError, ValidationError } from '@tashkurgan/shared'

const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** Lesson dates are calendar days stored as UTC midnight, so the weekday is read in UTC. */
export function weekdayOf(date: Date): string {
  return WEEKDAY_CODES[date.getUTCDay()]
}

/** A date's calendar day as UTC midnight -- the shape lesson dates are stored in. */
export function startOfUtcDay(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime()

export type RescheduleInput = {
  groupId: string
  /** The regular lesson day being moved. */
  originalDate: Date
  newDate: Date
  newTime: string
  reason?: string
}

/**
 * Moves one regular lesson to another day and/or time. Moving the same lesson
 * again updates its existing reschedule instead of stacking a second one.
 */
export async function rescheduleLesson(input: RescheduleInput) {
  const originalDate = startOfUtcDay(input.originalDate)
  const newDate = startOfUtcDay(input.newDate)

  const group = await prisma.group.findUnique({ where: { id: input.groupId } })
  if (!group) throw new NotFoundError('Group not found')
  if (group.archivedAt) throw new ConflictError('This group has been deleted')

  if (!group.scheduleDays.includes(weekdayOf(originalDate))) {
    throw new ValidationError('The group has no regular lesson on that day')
  }
  if (sameDay(originalDate, newDate) && input.newTime === group.scheduleTime) {
    throw new ValidationError('The new day and time are the same as the regular lesson')
  }

  if (!sameDay(originalDate, newDate)) {
    const held = await prisma.lessonSession.findUnique({
      where: { groupId_date: { groupId: group.id, date: originalDate } },
      select: { id: true },
    })
    if (held) throw new ConflictError('This lesson has already been recorded and can no longer be moved')

    const others = await prisma.lessonReschedule.findMany({
      where: { groupId: group.id, NOT: { originalDate } },
    })
    const regularThatDay =
      group.scheduleDays.includes(weekdayOf(newDate)) && !others.some((r) => sameDay(r.originalDate, newDate))
    const movedThatDay = others.some((r) => sameDay(r.newDate, newDate))
    if (regularThatDay || movedThatDay) {
      throw new ConflictError('The group already has a lesson on the new day')
    }
  }

  const data = { newDate, newTime: input.newTime, reason: input.reason?.trim() || null }
  return prisma.lessonReschedule.upsert({
    where: { groupId_originalDate: { groupId: group.id, originalDate } },
    // A changed reschedule hasn't been announced yet.
    update: { ...data, notifiedAt: null },
    create: { groupId: group.id, originalDate, ...data },
  })
}

/** Puts a moved lesson back on its regular day. */
export async function cancelReschedule(id: string) {
  const existing = await prisma.lessonReschedule.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('Reschedule not found')
  await prisma.lessonReschedule.delete({ where: { id } })
  return existing
}

/** Reschedules touching [from, to) on either end -- moved away from, or moved into, that range. */
export async function listReschedules(range: { from: Date; to: Date }, groupIds?: string[]) {
  const inRange = { gte: range.from, lt: range.to }
  return prisma.lessonReschedule.findMany({
    where: {
      ...(groupIds ? { groupId: { in: groupIds } } : {}),
      group: { archivedAt: null },
      OR: [{ originalDate: inRange }, { newDate: inRange }],
    },
    orderBy: { newDate: 'asc' },
  })
}

/** The group's upcoming changes: any reschedule whose old or new day is today or later. */
export async function upcomingReschedules(groupId: string, now: Date = new Date()) {
  const today = startOfUtcDay(now)
  return prisma.lessonReschedule.findMany({
    where: { groupId, OR: [{ originalDate: { gte: today } }, { newDate: { gte: today } }] },
    orderBy: { newDate: 'asc' },
  })
}

/** Every Telegram chat (student or parent) linked to a student currently in the group. */
export async function groupChatIds(groupId: string): Promise<string[]> {
  const links = await prisma.telegramLink.findMany({
    where: { student: { enrollments: { some: { groupId, status: 'ACTIVE' } } } },
    select: { chatId: true },
  })
  return links.map((l) => l.chatId)
}

export async function markRescheduleNotified(id: string, at: Date = new Date()) {
  return prisma.lessonReschedule.update({ where: { id }, data: { notifiedAt: at } })
}
