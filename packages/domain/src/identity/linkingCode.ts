import { randomInt } from 'node:crypto'
import { prisma } from '@tashkurgan/db'
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

/** Tolerates what copy/paste tends to add: surrounding/inner spaces, dashes, lowercase. */
export function normalizeLinkingCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

export function looksLikeLinkingCode(input: string): boolean {
  const code = normalizeLinkingCode(input)
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c))
}

export async function issueLinkingCode(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } })
  if (!student) throw new NotFoundError('Student not found')

  const code = generateCode()
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000)

  return prisma.linkingCode.create({ data: { code, studentId, expiresAt } })
}

/**
 * Binds a Telegram chat to the Student the code was issued for. The code is
 * reusable until it expires, so the student and each parent can redeem the
 * same code from their own Telegram accounts. A chat that was already linked
 * is re-pointed at the new student.
 */
export async function redeemLinkingCode(input: string, telegramChatId: string) {
  const code = normalizeLinkingCode(input)
  const linkingCode = await prisma.linkingCode.findUnique({ where: { code }, include: { student: true } })
  if (!linkingCode) throw new NotFoundError('Invalid code')
  if (linkingCode.expiresAt < new Date()) throw new ConflictError('Code expired')

  await prisma.telegramLink.upsert({
    where: { chatId: telegramChatId },
    create: { chatId: telegramChatId, studentId: linkingCode.studentId },
    update: { studentId: linkingCode.studentId, linkedAt: new Date() },
  })

  return linkingCode.student
}
