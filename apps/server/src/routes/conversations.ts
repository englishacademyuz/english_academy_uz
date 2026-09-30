import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getStaffThread, listConversations, postStaffMessage, unreadSummary } from '@tashkurgan/domain'

export type StaffMessageAnnouncement = { studentName: string; senderName: string; text: string }

/** Delivers a staff answer to the student's Telegram chats -- the bot in production, a no-op or spy in tests. */
export type ChatNotifier = (chatIds: string[], message: StaffMessageAnnouncement) => Promise<void>

const studentParams = z.object({ id: z.string() })
// Empty and over-long text is refused (400) by the domain.
const messageBody = z.object({ text: z.string() })

/** The panel's side of "Oʻqituvchi bilan muloqot" -- what each staff member sees is scoped in the domain. */
export const conversationRoutes: FastifyPluginAsync<{ notifier?: ChatNotifier }> = async (app, opts) => {
  const notifier: ChatNotifier = opts.notifier ?? (async () => {})

  app.get('/conversations', { preHandler: app.authenticate }, async (request) => listConversations(request.actor!))

  // Polled by the panel's chat button for its badge and new-message toasts.
  app.get('/conversations/unread', { preHandler: app.authenticate }, async (request) => unreadSummary(request.actor!))

  app.get('/students/:id/conversation', { preHandler: app.authenticate }, async (request) => {
    const { id } = studentParams.parse(request.params)
    return getStaffThread(request.actor!, id)
  })

  // Saves the answer, then sends it in the background (a slow Telegram call mustn't fail the request).
  app.post('/students/:id/conversation/messages', { preHandler: app.authenticate }, async (request) => {
    const { id } = studentParams.parse(request.params)
    const { text } = messageBody.parse(request.body)
    const { message, chatIds, studentName } = await postStaffMessage(request.actor!, id, text)
    notifier(chatIds, { studentName, senderName: message.senderName, text: message.text })
      .catch((err) => request.log.error({ err, studentId: id }, 'Chat message delivery failed'))
    return {
      id: message.id,
      sender: message.sender,
      senderName: message.senderName,
      text: message.text,
      createdAt: message.createdAt,
      deliveredChats: chatIds.length,
    }
  })
}
