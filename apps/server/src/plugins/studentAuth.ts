import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma, type Student } from '@tashkurgan/db'
import { AppError, ForbiddenError, UnauthorizedError } from '@tashkurgan/shared'
import { verifyTelegramInitData } from '../telegram/initData'

declare module 'fastify' {
  interface FastifyInstance {
    authenticateStudent: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    /** The one student this Mini App session may see -- resolved server-side, never from client input. */
    student?: Student
  }
}

/**
 * Authenticates Telegram Mini App requests. The client sends the raw
 * `initData` as `Authorization: tma <initData>`; it is verified with the bot
 * token, and the Telegram user id (a private chat's id) is mapped to a
 * Student through TelegramLink. Routes then read `request.student` only.
 */
export default fp<{ botToken?: string }>(async (app: FastifyInstance, opts) => {
  app.decorate('authenticateStudent', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!opts.botToken) throw new AppError('Telegram Mini App is not configured', 503)

    const header = request.headers.authorization ?? ''
    if (!header.startsWith('tma ')) throw new UnauthorizedError('Missing Telegram init data')

    const verified = verifyTelegramInitData(header.slice('tma '.length), opts.botToken)
    if (!verified) throw new UnauthorizedError('Invalid or expired Telegram init data')

    const link = await prisma.telegramLink.findUnique({
      where: { chatId: String(verified.user.id) },
      include: { student: true },
    })
    // A distinct code so the app can tell "link your account first" apart from other failures.
    if (!link) throw new ForbiddenError('NOT_LINKED')

    request.student = link.student
  })
})
