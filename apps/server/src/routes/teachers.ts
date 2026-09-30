import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan } from '@tashkurgan/domain'
import { ConflictError, NotFoundError, hashPassword } from '@tashkurgan/shared'

// Blank means "no phone" -- stored as null so the Mini App simply hides the call button.
const phone = z
  .string()
  .trim()
  .max(32)
  .transform((v) => v || null)

const createSchema = z.object({
  fullName: z.string().min(1),
  username: z.string().min(3),
  password: z.string().min(8),
  phone: phone.optional(),
})

const updateSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: phone.optional(),
})

const paramsSchema = z.object({ id: z.string() })

export const teacherRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'teacher', action: 'manage' })
    const body = createSchema.parse(request.body)

    const existing = await prisma.user.findUnique({ where: { username: body.username } })
    if (existing) throw new ConflictError('Username already taken')

    const passwordHash = await hashPassword(body.password)

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { role: 'TEACHER', username: body.username, passwordHash },
      })
      return tx.teacher.create({ data: { fullName: body.fullName, phone: body.phone ?? null, userId: user.id } })
    })
  })

  app.get('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'teacher', action: 'view' })
    return prisma.teacher.findMany()
  })

  app.patch('/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'teacher', action: 'manage' })
    const { id } = paramsSchema.parse(request.params)
    const body = updateSchema.parse(request.body)
    const existing = await prisma.teacher.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('Teacher not found')
    return prisma.teacher.update({ where: { id }, data: body })
  })
}
