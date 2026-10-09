import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@tashkurgan/db'
import {
  assertCan,
  deleteStudent,
  getFamily,
  getStudentOverview,
  issueLinkingCode,
  listStudentsWithStats,
  tieStudents,
  untieStudent,
} from '@tashkurgan/domain'
import { NotFoundError, tashkentToday, toStoredDate } from '@tashkurgan/shared'

const age = z.number().int().min(1).max(100)

/**
 * The admin enters only an age, not a birth date -- stored as a birth date that many years
 * before today, so the age shown keeps counting up year by year.
 */
function dobFromAge(years: number): Date {
  const today = tashkentToday()
  return toStoredDate({ ...today, year: today.year - years })
}

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  age,
  phone: z.string().optional(),
  // The day they joined -- their monthly payment day; defaults to now.
  joinedAt: z.coerce.date().optional(),
})

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  age: age.optional(),
  phone: z.string().optional(),
  joinedAt: z.coerce.date().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'INACTIVE', 'COMPLETED', 'LEFT']).optional(),
})

const querySchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'INACTIVE', 'COMPLETED', 'LEFT']).optional(),
})

const paramsSchema = z.object({ id: z.string() })
const tieSchema = z.object({ studentId: z.string().min(1) })

export const studentRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'manage' })
    const { age: years, ...body } = createSchema.parse(request.body)
    return prisma.student.create({ data: { ...body, dob: dobFromAge(years) } })
  })

  app.get('/', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'view' })
    const { status } = querySchema.parse(request.query)
    return listStudentsWithStats({ status })
  })

  app.get('/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'view' })
    const { id } = paramsSchema.parse(request.params)
    const student = await prisma.student.findUnique({
      where: { id },
      include: { enrollments: true },
    })
    if (!student) throw new NotFoundError('Student not found')
    return student
  })

  app.patch('/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'manage' })
    const { id } = paramsSchema.parse(request.params)
    const { age: years, ...body } = updateSchema.parse(request.body)
    return prisma.student.update({
      where: { id },
      data: { ...body, ...(years !== undefined ? { dob: dobFromAge(years) } : {}) },
    })
  })

  // Deletes the student and all their records -- admins only, like every other student change.
  app.delete('/:id', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'manage' })
    const { id } = paramsSchema.parse(request.params)
    await deleteStudent(id)
    return { ok: true }
  })

  // The single deep read model backing the student detail screen -- groups,
  // Telegram links, attendance, marks, payments, and points in one call (§28).
  app.get('/:id/overview', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'view' })
    const { id } = paramsSchema.parse(request.params)
    return getStudentOverview(id)
  })

  // Siblings who share one phone: tied together, one chat opens all of them (see identity/family.ts).
  app.get('/:id/family', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'view' })
    const { id } = paramsSchema.parse(request.params)
    return getFamily(id)
  })

  app.post('/:id/family', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'manage' })
    const { id } = paramsSchema.parse(request.params)
    const { studentId } = tieSchema.parse(request.body)
    return tieStudents(id, studentId)
  })

  app.delete('/:id/family', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'student', action: 'manage' })
    const { id } = paramsSchema.parse(request.params)
    await untieStudent(id)
    return { ok: true }
  })

  app.post('/:id/linking-code', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.actor!, { resource: 'linkingCode', action: 'issue' })
    const { id } = paramsSchema.parse(request.params)
    return issueLinkingCode(id)
  })
}
