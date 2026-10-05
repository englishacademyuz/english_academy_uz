import { prisma, type Prisma } from '@tashkurgan/db'
import type { StoredPhoto } from './submission'

/** How many pictures a teacher may hand out with one homework. */
export const MAX_HOMEWORK_IMAGES = 5

/** The longest caption under one picture. */
export const MAX_HOMEWORK_IMAGE_CAPTION = 500

/** The longest title of one picture's task ("Listening", "Vocabulary"). */
export const MAX_HOMEWORK_IMAGE_TITLE = 100

/** A homework read with its pictures, in order -- what each task says, never Telegram's file ids. */
export const HOMEWORK_WITH_IMAGES = {
  include: {
    images: {
      orderBy: { position: 'asc' },
      select: { id: true, title: true, caption: true, dueDate: true, width: true, height: true },
    },
  },
} satisfies Prisma.HomeworkDefaultArgs

/** One picture as the lesson save lists it: which one, its title, caption and deadline. */
export type HomeworkImageInput = { id: string; title?: string | null; caption?: string | null; dueDate?: Date | null }

/**
 * Keeps a picture the teacher just uploaded for a group. It belongs to no homework yet --
 * saving the lesson attaches it (see `attachHomeworkImages`).
 */
export function createHomeworkImage(groupId: string, photo: StoredPhoto) {
  return prisma.homeworkImage.create({
    data: {
      groupId,
      telegramFileId: photo.fileId,
      telegramFileUniqueId: photo.fileUniqueId,
      width: photo.width ?? null,
      height: photo.height ?? null,
      size: photo.size ?? null,
    },
    select: HOMEWORK_WITH_IMAGES.include.images.select,
  })
}

/**
 * Makes `images` the homework's pictures, in that order and with those titles, captions and
 * deadlines. Pictures it had before that aren't listed are removed. Only pictures uploaded for
 * the same group count -- an id from another group is ignored, so one teacher can't pull in
 * another's.
 */
export async function attachHomeworkImages(
  tx: Prisma.TransactionClient,
  homeworkId: string,
  groupId: string,
  images: HomeworkImageInput[],
) {
  const ids = images.map((image) => image.id)
  await tx.homeworkImage.deleteMany({ where: { homeworkId, id: { notIn: ids } } })
  for (const [position, image] of images.entries()) {
    const title = image.title?.trim()
    const caption = image.caption?.trim()
    await tx.homeworkImage.updateMany({
      where: { id: image.id, groupId, OR: [{ homeworkId: null }, { homeworkId }] },
      data: { homeworkId, position, title: title || null, caption: caption || null, dueDate: image.dueDate ?? null },
    })
  }
}
