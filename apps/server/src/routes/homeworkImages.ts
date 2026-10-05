import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import { assertCan, createHomeworkImage } from '@tashkurgan/domain'
import { AppError, NotFoundError, ValidationError } from '@tashkurgan/shared'
import { isSupportedImage, type HomeworkFileStore } from '../telegram/fileStore'
import { sendHomeworkPhoto } from './homeworkSubmissions'

/** A picture is shrunk in the browser first; this only stops something absurd. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const idParams = z.object({ id: z.string() })
const groupIdParams = z.object({ groupId: z.string() })

/** The pictures a teacher hands out with homework (HomeworkImage) -- uploaded, then attached by saving the lesson. */
export const homeworkImageRoutes: FastifyPluginAsync<{ fileStore?: HomeworkFileStore }> = async (app, opts) => {
  // Pictures are posted as the raw image bytes.
  app.addContentTypeParser(['image/jpeg', 'image/png', 'image/webp'], { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  )

  // One picture per request, so a slow connection loses at most one.
  app.post('/groups/:groupId/homework-images', { preHandler: app.authenticate, bodyLimit: MAX_UPLOAD_BYTES }, async (request) => {
    const { groupId } = groupIdParams.parse(request.params)
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { name: true, teacherId: true } })
    if (!group) throw new NotFoundError('Group not found')
    assertCan(request.actor!, { resource: 'lessonSession', action: 'manage', ownerTeacherId: group.teacherId })

    const body = request.body
    if (!Buffer.isBuffer(body) || !isSupportedImage(body)) throw new ValidationError('Send a JPEG, PNG or WebP image')
    if (!opts.fileStore) throw new AppError('Image storage is not configured', 503)

    const stored = await opts.fileStore.upload(body, { caption: `📚 ${group.name} · uyga vazifa` })
    return createHomeworkImage(groupId, stored)
  })

  app.get('/homework-images/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = idParams.parse(request.params)
    const image = await prisma.homeworkImage.findUnique({
      where: { id },
      select: { telegramFileId: true, group: { select: { teacherId: true } } },
    })
    if (!image) throw new NotFoundError('Image not found')
    assertCan(request.actor!, { resource: 'lessonSession', action: 'view', ownerTeacherId: image.group.teacherId })
    return sendHomeworkPhoto(reply, opts.fileStore, image.telegramFileId)
  })
}
