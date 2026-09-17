import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '@tashkurgan/db'
import type { Actor } from '@tashkurgan/domain'
import { UnauthorizedError } from '@tashkurgan/shared'
import { config } from '../config'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    actor?: Actor
  }
}

/**
 * Resolves the caller into one shared `Actor` shape before any use-case runs
 * -- see docs/ARCHITECTURE.md §5. Every route that needs a caller identity
 * declares `{ preHandler: app.authenticate }`.
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(cookie)
  await app.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'token', signed: false },
  })

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      throw new UnauthorizedError('Not authenticated')
    }

    const payload = request.user as { userId: string }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { student: true, parent: true, teacher: true },
    })
    if (!user) throw new UnauthorizedError('Not authenticated')

    request.actor = {
      userId: user.id,
      role: user.role,
      studentId: user.student?.id,
      parentId: user.parent?.id,
      teacherId: user.teacher?.id,
    }
  })
})
