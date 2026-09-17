import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan } from '@tashkurgan/domain'
import { ConflictError, hashPassword } from '@tashkurgan/shared'

const createSchema = z.object({
  fullName: z.string().min(1),
  username: z.string().min(3),
  password: z.string().min(8),
})

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
      return tx.teacher.create({ data: { fullName: body.fullName, userId: user.id } })
    })
  })

  app.get('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'teacher', action: 'view' })
    return prisma.teacher.findMany()
  })
}
