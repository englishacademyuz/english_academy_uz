import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { AnnouncementKind } from '@tashkurgan/db'
import {
  announcementChatIds,
  announcementImageForStaff,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncementsForStaff,
  prepareAnnouncement,
  recordAnnouncementMessages,
} from '@tashkurgan/domain'
import { AppError, ValidationError } from '@tashkurgan/shared'
import { isSupportedImage, type HomeworkFileStore } from '../telegram/fileStore'
import { sendHomeworkFile } from './homeworkSubmissions'

/** What the bot sends to each chat. */
export type AnnouncementBroadcast = {
  id: string
  kind: AnnouncementKind
  title: string
  body: string
  eventAt: Date | null
  amount: number | null
  authorName: string
  imageFileId: string | null
}

/** One Telegram message an announcement went out as. */
export type SentMessage = { chatId: string; messageId: number }

/**
 * Sends announcements to Telegram chats and takes them back when one is deleted -- the bot in
 * production, a no-op or spy in tests.
 */
export type AnnouncementNotifier = {
  send(chatIds: string[], announcement: AnnouncementBroadcast): Promise<SentMessage[]>
  retract(messages: SentMessage[]): Promise<void>
}

/** The picture is shrunk in the browser first and sent as base64 (a third bigger); this only stops something absurd. */
const MAX_BODY_BYTES = 15 * 1024 * 1024

const createSchema = z.object({
  kind: z.enum(['NEWS', 'EVENT', 'ORGANIZATIONAL']),
  title: z.string(),
  body: z.string(),
  eventAt: z.coerce.date().nullable().optional(),
  amount: z.number().int().nullable().optional(),
  groupIds: z.array(z.string()),
  /** A JPEG, PNG or WebP picture as base64 (a data URL is fine too). */
  image: z.string().nullable().optional(),
})
const idParams = z.object({ id: z.string() })

function decodeImage(image: string): Buffer {
  const bytes = Buffer.from(image.replace(/^data:[^,]*,/, ''), 'base64')
  if (!isSupportedImage(bytes)) throw new ValidationError('Send a JPEG, PNG or WebP image')
  return bytes
}

const noNotifier: AnnouncementNotifier = { send: async () => [], retract: async () => {} }

/** News, events and organizational notices staff send to groups -- see packages/domain announcement.ts. */
export const announcementRoutes: FastifyPluginAsync<{
  fileStore?: HomeworkFileStore
  notifier?: AnnouncementNotifier
}> = async (app, opts) => {
  const notifier = opts.notifier ?? noNotifier

  app.get('/announcements', { preHandler: app.authenticate }, async (request) => listAnnouncementsForStaff(request.actor!))

  app.post('/announcements', { preHandler: app.authenticate, bodyLimit: MAX_BODY_BYTES }, async (request) => {
    const actor = request.actor!
    const { image, ...body } = createSchema.parse(request.body)
    // Checked before the picture goes to Telegram, so a refused one uploads nothing.
    const input = await prepareAnnouncement(actor, body)

    let stored = null
    if (image) {
      const bytes = decodeImage(image)
      if (!opts.fileStore) throw new AppError('Image storage is not configured', 503)
      stored = await opts.fileStore.upload(bytes, { caption: `📣 ${input.title}` })
    }
    const { imageFileId, ...announcement } = await createAnnouncement(actor, input, stored)

    // Sent in the background -- a slow Telegram call mustn't fail the request.
    const chatIds = await announcementChatIds(input.groupIds)
    notifier
      .send(chatIds, { ...announcement, imageFileId })
      .then(async (messages) => {
        if (!(await recordAnnouncementMessages(announcement.id, messages))) await notifier.retract(messages)
      })
      .catch((err) => request.log.error({ err, announcementId: announcement.id }, 'Announcement delivery failed'))

    return { ...announcement, notifiedChats: chatIds.length }
  })

  app.get('/announcements/:id/image', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParams.parse(request.params)
    return sendHomeworkFile(reply, opts.fileStore, await announcementImageForStaff(request.actor!, id))
  })

  // Takes it out of the Mini App, and out of the Telegram chats it was sent to.
  app.delete('/announcements/:id', { preHandler: app.authenticate }, async (request) => {
    const { id } = idParams.parse(request.params)
    const messages = await deleteAnnouncement(request.actor!, id)
    notifier
      .retract(messages)
      .catch((err) => request.log.error({ err, announcementId: id }, 'Taking an announcement back failed'))
    return { ok: true }
  })
}
