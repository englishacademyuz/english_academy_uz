import { prisma, type AttendanceStatus, type LessonMaterialType } from '@tashkurgan/db'
import { NotFoundError } from '@tashkurgan/shared'

type MaterialInput = { type: LessonMaterialType; content: string }
type AttendanceInput = { studentId: string; status: AttendanceStatus }
type HomeworkInput = { instructions: string; dueDate?: Date }

export type RecordLessonSessionInput = {
  groupId: string
  teacherId: string
  date: Date
  topic?: string
  notes?: string
  materials?: MaterialInput[]
  homework?: HomeworkInput
  attendance?: AttendanceInput[]
}

/**
 * The teacher's single "save the lesson" action (requirements §29): topic,
 * materials, homework, and attendance for one group on one date, saved
 * together in one transaction. Upserts on (group, date) -- re-saving the
 * same day's session updates it rather than duplicating it.
 */
export async function recordLessonSession(input: RecordLessonSessionInput) {
  const group = await prisma.group.findUnique({ where: { id: input.groupId } })
  if (!group) throw new NotFoundError('Group not found')

  return prisma.$transaction(async (tx) => {
    const session = await tx.lessonSession.upsert({
      where: { groupId_date: { groupId: input.groupId, date: input.date } },
      update: { topic: input.topic, notes: input.notes, teacherId: input.teacherId },
      create: {
        groupId: input.groupId,
        teacherId: input.teacherId,
        date: input.date,
        topic: input.topic,
        notes: input.notes,
      },
    })

    if (input.materials) {
      await tx.lessonMaterial.deleteMany({ where: { lessonSessionId: session.id } })
      if (input.materials.length > 0) {
        await tx.lessonMaterial.createMany({
          data: input.materials.map((material) => ({ ...material, lessonSessionId: session.id })),
        })
      }
    }

    if (input.homework) {
      await tx.homework.upsert({
        where: { lessonSessionId: session.id },
        update: { instructions: input.homework.instructions, dueDate: input.homework.dueDate },
        create: {
          lessonSessionId: session.id,
          instructions: input.homework.instructions,
          dueDate: input.homework.dueDate,
        },
      })
    }

    if (input.attendance) {
      for (const entry of input.attendance) {
        await tx.attendance.upsert({
          where: {
            lessonSessionId_studentId: { lessonSessionId: session.id, studentId: entry.studentId },
          },
          update: { status: entry.status },
          create: { lessonSessionId: session.id, studentId: entry.studentId, status: entry.status },
        })
      }
    }

    return tx.lessonSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { materials: true, homework: true, attendances: true },
    })
  })
}
