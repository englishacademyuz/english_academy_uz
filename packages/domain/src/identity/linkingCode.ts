import { randomInt } from 'node:crypto'
import { prisma, type LinkingTargetType } from '@tashkurgan/db'
import { ConflictError, NotFoundError } from '@tashkurgan/shared'

const CODE_LENGTH = 8
const EXPIRY_HOURS = 24
// Excludes visually ambiguous characters (0/O, 1/I) since a human reads this aloud/types it.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)]
  }
  return code
}

export async function issueLinkingCode(targetType: LinkingTargetType, targetId: string) {
  if (targetType === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { id: targetId } })
    if (!student) throw new NotFoundError('Student not found')
  } else {
    const parent = await prisma.parent.findUnique({ where: { id: targetId } })
    if (!parent) throw new NotFoundError('Parent not found')
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000)

  return prisma.linkingCode.create({ data: { code, targetType, targetId, expiresAt } })
}

/**
 * Binds a Telegram chat id to the Student/Parent the code was issued for.
 * Creates the underlying User row lazily on first redemption if the target
 * doesn't have one yet.
 */
export async function redeemLinkingCode(code: string, telegramChatId: string) {
  const linkingCode = await prisma.linkingCode.findUnique({ where: { code } })
  if (!linkingCode) throw new NotFoundError('Invalid code')
  if (linkingCode.consumedAt) throw new ConflictError('Code already used')
  if (linkingCode.expiresAt < new Date()) throw new ConflictError('Code expired')

  const alreadyLinked = await prisma.user.findUnique({ where: { telegramChatId } })
  if (alreadyLinked) throw new ConflictError('This Telegram account is already linked')

  return prisma.$transaction(async (tx) => {
    let userId: string

    if (linkingCode.targetType === 'STUDENT') {
      const student = await tx.student.findUniqueOrThrow({ where: { id: linkingCode.targetId } })
      if (student.userId) {
        userId = student.userId
      } else {
        const user = await tx.user.create({ data: { role: 'STUDENT' } })
        await tx.student.update({ where: { id: student.id }, data: { userId: user.id } })
        userId = user.id
      }
    } else {
      const parent = await tx.parent.findUniqueOrThrow({ where: { id: linkingCode.targetId } })
      if (parent.userId) {
        userId = parent.userId
      } else {
        const user = await tx.user.create({ data: { role: 'PARENT' } })
        await tx.parent.update({ where: { id: parent.id }, data: { userId: user.id } })
        userId = user.id
      }
    }

    await tx.user.update({ where: { id: userId }, data: { telegramChatId } })
    await tx.linkingCode.update({ where: { code }, data: { consumedAt: new Date() } })

    return tx.user.findUniqueOrThrow({ where: { id: userId } })
  })
}
