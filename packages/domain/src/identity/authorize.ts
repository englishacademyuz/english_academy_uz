import { ForbiddenError } from '@tashkurgan/shared'
import type { Actor } from './actor'

/**
 * Every permission check in the system goes through this one module.
 * ADMIN can do everything. Per docs/ARCHITECTURE.md §5, Group and Enrollment
 * management stay ADMIN-only; a Teacher's own writes are scoped to the
 * LessonSession/Attendance/Homework/Assessment data of groups they teach
 * (`ownerTeacherId` is always the group's teacher, checked against the
 * caller). AssessmentCategory is owned by Level, so it's ADMIN-managed like
 * Subject/Course/Level, with Teacher limited to viewing it.
 */
export type Permission =
  | { resource: 'subject' | 'course' | 'level'; action: 'manage' | 'view' }
  | { resource: 'teacher'; action: 'manage' | 'view' }
  | { resource: 'student'; action: 'manage' | 'view' }
  | { resource: 'parent'; action: 'manage' | 'view' }
  | { resource: 'parentStudentLink'; action: 'manage' }
  | { resource: 'linkingCode'; action: 'issue' }
  | { resource: 'group'; action: 'manage' }
  | { resource: 'group'; action: 'view'; ownerTeacherId: string }
  | { resource: 'enrollment'; action: 'manage' }
  | { resource: 'lessonSession'; action: 'manage' | 'view'; ownerTeacherId: string }
  | { resource: 'homeworkResult'; action: 'manage'; ownerTeacherId: string }
  | { resource: 'assessment'; action: 'manage' | 'view'; ownerTeacherId: string }
  | { resource: 'assessmentCategory'; action: 'manage' | 'view' }
  | { resource: 'progress'; action: 'view'; ownerTeacherId?: string }
  // Both Admin and Teacher may record/edit payments -- a small center's
  // teacher often collects payment in person (§51.4) -- so this is
  // unrestricted by group, unlike the Teacher's other writes.
  | { resource: 'payment'; action: 'manage' | 'view' }
  | { resource: 'pointTransaction'; action: 'view' }
  | { resource: 'pointTransaction'; action: 'manage'; ownerTeacherId: string }

export function can(actor: Actor, permission: Permission): boolean {
  if (actor.role === 'ADMIN') return true

  if (actor.role === 'TEACHER') {
    switch (permission.resource) {
      case 'group':
        return permission.action === 'view' && permission.ownerTeacherId === actor.teacherId
      case 'lessonSession':
      case 'homeworkResult':
      case 'assessment':
        return permission.ownerTeacherId === actor.teacherId
      case 'assessmentCategory':
        return permission.action === 'view'
      case 'progress':
        // A Teacher may only view progress scoped to one of their own
        // groups -- cross-group student progress stays ADMIN-only.
        return permission.ownerTeacherId === actor.teacherId
      case 'payment':
        return true
      case 'pointTransaction':
        return permission.action === 'view' || permission.ownerTeacherId === actor.teacherId
      case 'student':
      case 'parent':
      case 'teacher':
      case 'subject':
      case 'course':
      case 'level':
        return permission.action === 'view'
      default:
        return false
    }
  }

  return false
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
    throw new ForbiddenError()
  }
}
