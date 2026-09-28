import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma, type LessonReschedule } from '@tashkurgan/db'
import {
  assertCan,
  cancelReschedule,
  groupChatIds,
  listReschedules,
  markRescheduleNotified,
  rescheduleLesson,
} from '@tashkurgan/domain'
import { NotFoundError } from '@tashkurgan/shared'

export type LessonChangeAnnouncement = {
  groupName: string
  /** `moved`: the lesson now happens on newDate/newTime. `restored`: back on its regular day. */
  kind: 'moved' | 'restored'
  originalDate: Date
  regularTime: string
  newDate: Date
  newTime: string
  reason: string | null
}

/** Tells a group's Telegram chats their lesson moved -- the bot in production, a no-op or spy in tests. */
export type LessonChangeNotifier = (chatIds: string[], change: LessonChangeAnnouncement) => Promise<void>

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const rescheduleSchema = z.object({
  originalDate: z.coerce.date(),
  newDate: z.coerce.date(),
  newTime: z.string().regex(TIME),
  reason: z.string().max(200).optional(),
  notify: z.boolean().optional(),
})
const rangeQuery = z.object({ from: z.coerce.date(), to: z.coerce.date() })
const groupIdParams = z.object({ groupId: z.string() })
const idParams = z.object({ id: z.string() })
const notifyQuery = z.object({ notify: z.enum(['true', 'false']).optional() })

async function requireGroup(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } })
  if (!group) throw new NotFoundError('Group not found')
  return group
}

async function requireReschedule(id: string) {
  const reschedule = await prisma.lessonReschedule.findUnique({ where: { id }, include: { group: true } })
  if (!reschedule) throw new NotFoundError('Reschedule not found')
  return reschedule
}

export const scheduleRoutes: FastifyPluginAsync<{ notifier?: LessonChangeNotifier }> = async (app, opts) => {
  const notifier: LessonChangeNotifier = opts.notifier ?? (async () => {})

  /** Sends in the background (a slow Telegram call mustn't fail the request); returns how many chats it goes to. */
  async function announce(
    request: FastifyRequest,
    group: { id: string; name: string; scheduleTime: string },
    reschedule: LessonReschedule,
    kind: LessonChangeAnnouncement['kind'],
  ) {
    const chatIds = await groupChatIds(group.id)
    notifier(chatIds, {
      groupName: group.name,
      kind,
      originalDate: reschedule.originalDate,
      regularTime: group.scheduleTime,
      newDate: reschedule.newDate,
      newTime: reschedule.newTime,
      reason: reschedule.reason,
    }).catch((err) => request.log.error({ err, rescheduleId: reschedule.id }, 'Lesson change announcement failed'))
    return chatIds.length
  }

  // Every reschedule in the range for the groups the caller can see -- the
  // dashboard timetable overlays these on the regular weekly schedule.
  app.get('/reschedules', { preHandler: app.authenticate }, async (request) => {
    const actor = request.actor!
    const range = rangeQuery.parse(request.query)
    const groupIds =
      actor.role === 'TEACHER'
        ? (await prisma.group.findMany({ where: { teacherId: actor.teacherId }, select: { id: true } })).map((g) => g.id)
        : undefined
    return listReschedules(range, groupIds)
  })

  app.put('/groups/:groupId/reschedules', { preHandler: app.authenticate }, async (request) => {
    const { groupId } = groupIdParams.parse(request.params)
    const group = await requireGroup(groupId)
    assertCan(request.actor!, { resource: 'lessonSchedule', action: 'manage', ownerTeacherId: group.teacherId })

    const { notify, ...input } = rescheduleSchema.parse(request.body)
    let reschedule = await rescheduleLesson({ groupId, ...input })
    let notifiedChats: number | null = null
    if (notify) {
      notifiedChats = await announce(request, group, reschedule, 'moved')
      reschedule = await markRescheduleNotified(reschedule.id)
    }
    return { ...reschedule, notifiedChats }
  })

  // The "notify students" button -- for a change saved without notifying, or to remind them again.
  app.post('/reschedules/:id/notify', { preHandler: app.authenticate }, async (request) => {
    const { id } = idParams.parse(request.params)
    const reschedule = await requireReschedule(id)
    assertCan(request.actor!, {
      resource: 'lessonSchedule',
      action: 'manage',
      ownerTeacherId: reschedule.group.teacherId,
    })
    const notifiedChats = await announce(request, reschedule.group, reschedule, 'moved')
    const updated = await markRescheduleNotified(id)
    return { ...updated, notifiedChats }
  })

  // Puts the lesson back on its regular day; students who were told about the
  // move are told it's undone (or anyone, with ?notify=true).
  app.delete('/reschedules/:id', { preHandler: app.authenticate }, async (request) => {
    const { id } = idParams.parse(request.params)
    const reschedule = await requireReschedule(id)
    assertCan(request.actor!, {
      resource: 'lessonSchedule',
      action: 'manage',
      ownerTeacherId: reschedule.group.teacherId,
    })
    const { notify } = notifyQuery.parse(request.query)
    await cancelReschedule(id)
    const shouldNotify = notify === 'true' || (notify === undefined && reschedule.notifiedAt !== null)
    const notifiedChats = shouldNotify ? await announce(request, reschedule.group, reschedule, 'restored') : null
    return { ok: true, notifiedChats }
  })
}
