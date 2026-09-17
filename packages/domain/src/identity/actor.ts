import type { Role } from '@tashkurgan/db'

/**
 * The authenticated caller, resolved once per request from the verified
 * session/JWT. Every entry adapter (HTTP, Telegram) builds one of these
 * before calling into any use-case -- see docs/ARCHITECTURE.md §5.
 */
export type Actor = {
  userId: string
  role: Role
  studentId?: string
  parentId?: string
  teacherId?: string
}
