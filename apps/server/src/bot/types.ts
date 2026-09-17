import type { Context, SessionFlavor } from 'grammy'

/**
 * Genuinely disposable UI convenience only -- lost on restart is fine.
 * Which linked child a Parent is currently looking at is the one piece of
 * bot state that isn't already durable in the database (docs/ARCHITECTURE.md §6).
 */
export type SessionData = {
  selectedStudentId?: string
}

export type BotContext = Context & SessionFlavor<SessionData>
