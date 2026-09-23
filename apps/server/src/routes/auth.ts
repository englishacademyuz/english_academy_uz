import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { redeemLinkingCode } from '@tashkurgan/domain'
import { UnauthorizedError, verifyPassword } from '@tashkurgan/shared'
import { config } from '../config'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

const redeemSchema = z.object({
  code: z.string().min(1),
  telegramChatId: z.string().min(1),
})

// In production admin-web and the server live on different *.up.railway.app
// subdomains, which browsers treat as cross-site (up.railway.app is a public
// suffix), so the cookie must be SameSite=None + Secure to be sent at all.
const isProd = config.nodeEnv === 'production'
const cookieOptions = {
  httpOnly: true,
  path: '/',
  sameSite: isProd ? ('none' as const) : ('lax' as const),
  secure: isProd,
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await prisma.user.findUnique({ where: { username: body.username } })
    if (!user || !user.passwordHash) throw new UnauthorizedError('Invalid credentials')

    const valid = await verifyPassword(body.password, user.passwordHash)
    if (!valid) throw new UnauthorizedError('Invalid credentials')

    const token = app.jwt.sign({ userId: user.id }, { expiresIn: '12h' })
    reply.setCookie('token', token, { ...cookieOptions, maxAge: 60 * 60 * 12 })

    return { id: user.id, role: user.role }
  })

  app.post('/logout', async (_request, reply) => {
    reply.clearCookie('token', cookieOptions)
    return { ok: true }
  })

  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    return request.actor
  })

  // Placeholder for the Telegram bot's identity-linking flow (§6 of the
  // architecture doc) -- callable directly over HTTP for now since the bot
  // itself isn't built yet.
  app.post('/telegram/redeem', async (request) => {
    const body = redeemSchema.parse(request.body)
    const user = await redeemLinkingCode(body.code, body.telegramChatId)
    return { id: user.id, role: user.role }
  })
}
