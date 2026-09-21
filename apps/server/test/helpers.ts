import { prisma } from '@tashkurgan/db'
import { hashPassword } from '@tashkurgan/shared'
import { buildApp } from '../src/app'

type App = Awaited<ReturnType<typeof buildApp>>

export async function resetDb() {
  await prisma.pointTransaction.deleteMany()
  await prisma.assessmentResult.deleteMany()
  await prisma.assessment.deleteMany()
  await prisma.assessmentCategory.deleteMany()
  await prisma.homeworkResult.deleteMany()
  await prisma.homework.deleteMany()
  await prisma.attendance.deleteMany()
  await prisma.lessonMaterial.deleteMany()
  await prisma.lessonSession.deleteMany()
  await prisma.linkingCode.deleteMany()
  await prisma.parentStudentLink.deleteMany()
  await prisma.enrollment.deleteMany()
  await prisma.group.deleteMany()
  await prisma.level.deleteMany()
  await prisma.course.deleteMany()
  await prisma.subject.deleteMany()
  await prisma.student.deleteMany()
  await prisma.parent.deleteMany()
  await prisma.teacher.deleteMany()
  await prisma.user.deleteMany()
}

export async function seedAcademicStructure() {
  const subject = await prisma.subject.create({ data: { name: 'English' } })
  const course = await prisma.course.create({ data: { name: 'General English', subjectId: subject.id } })
  const level = await prisma.level.create({ data: { name: 'Elementary', courseId: course.id } })
  const { teacher } = await createTeacherUser()
  const group = await prisma.group.create({
    data: {
      name: 'A',
      levelId: level.id,
      teacherId: teacher.id,
      scheduleDays: ['MON'],
      scheduleTime: '18:00',
      startDate: new Date(),
    },
  })
  const student = await prisma.student.create({
    data: { firstName: 'Ali', lastName: 'K', dob: new Date('2012-01-01') },
  })
  await prisma.enrollment.create({
    data: {
      studentId: student.id,
      groupId: group.id,
      subjectId: subject.id,
      startDate: new Date(),
      status: 'ACTIVE',
    },
  })
  return { subject, course, level, teacher, group, student }
}

export async function createAdmin(username = 'admin', password = 'admin12345') {
  const passwordHash = await hashPassword(password)
  return prisma.user.create({ data: { username, role: 'ADMIN', passwordHash } })
}

export async function createTeacherUser(username = 'teacher1', password = 'teacher12345') {
  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({ data: { username, role: 'TEACHER', passwordHash } })
  const teacher = await prisma.teacher.create({ data: { fullName: 'Test Teacher', userId: user.id } })
  return { user, teacher }
}

export async function loginAs(app: App, username: string, password: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username, password },
  })
  const cookie = res.cookies.find((c) => c.name === 'token')
  if (!cookie) throw new Error(`Login failed for ${username}: ${res.body}`)
  return `${cookie.name}=${cookie.value}`
}
