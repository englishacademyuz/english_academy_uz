import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Student } from '@tashkurgan/db'
import { chatAccess } from '@tashkurgan/domain'
import { AppError, ForbiddenError, UnauthorizedError } from '@tashkurgan/shared'
import { verifyTelegramInitData, type TelegramInitUser } from '../telegram/initData'

declare module 'fastify' {
  interface FastifyInstance {
    authenticateStudent: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    /** The one student this Mini App session may see -- resolved server-side, never trusted from client input. */
    student?: Student
    /** Every student this Telegram account may open: the linked one, plus tied siblings. */
    studentChoices?: Student[]
    /** The verified Telegram account making the request -- its id is the linked chat's id. */
    telegramUser?: TelegramInitUser
  }
}

/** Which of the family's students the app has opened -- only honored when this chat may open them. */
export const STUDENT_HEADER = 'x-student-id'

/**
 * Authenticates Telegram Mini App requests. The client sends the raw
 * `initData` as `Authorization: tma <initData>`; it is verified with the bot
 * token, and the Telegram user id (a private chat's id) is mapped to a
 * Student through TelegramLink. Siblings who share a phone (a Family) can all
 * be opened from one chat: the app names the one chosen in `x-student-id`,
 * which must be one of them. Routes then read `request.student` only.
 */
export default fp<{ botToken?: string }>(async (app: FastifyInstance, opts) => {
  app.decorate('authenticateStudent', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!opts.botToken) throw new AppError('Telegram Mini App is not configured', 503)

    const header = request.headers.authorization ?? ''
    if (!header.startsWith('tma ')) throw new UnauthorizedError('Missing Telegram init data')

    const verified = verifyTelegramInitData(header.slice('tma '.length), opts.botToken)
    if (!verified) throw new UnauthorizedError('Invalid or expired Telegram init data')

    const access = await chatAccess(String(verified.user.id))
    // A distinct code so the app can tell "link your account first" apart from other failures.
    if (!access) throw new ForbiddenError('NOT_LINKED')

    const chosen = request.headers[STUDENT_HEADER]
    let student = access.current
    if (typeof chosen === 'string' && chosen) {
      const match = access.students.find((s) => s.id === chosen)
      // E.g. the siblings were untied while the app was open -- it asks again.
      if (!match) throw new ForbiddenError('ACCOUNT_UNAVAILABLE')
      student = match
    }

    request.student = student
    request.studentChoices = access.students
    request.telegramUser = verified.user
  })
})
