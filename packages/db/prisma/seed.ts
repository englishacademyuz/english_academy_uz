import { PrismaClient } from '@prisma/client'
import { hashPassword } from '@tashkurgan/shared'

const prisma = new PrismaClient()

async function main() {
  const adminPasswordHash = await hashPassword('admin12345')
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', role: 'ADMIN', passwordHash: adminPasswordHash },
  })

  const teacherPasswordHash = await hashPassword('teacher12345')
  const teacherUser = await prisma.user.upsert({
    where: { username: 'umid' },
    update: {},
    create: { username: 'umid', role: 'TEACHER', passwordHash: teacherPasswordHash },
  })
  const teacher = await prisma.teacher.upsert({
    where: { userId: teacherUser.id },
    update: {},
    create: { fullName: 'Umid Teacher', userId: teacherUser.id },
  })

  const subject = await prisma.subject.upsert({
    where: { name: 'English' },
    update: {},
    create: { name: 'English' },
  })

  const course = await prisma.course.upsert({
    where: { subjectId_name: { subjectId: subject.id, name: 'General English' } },
    update: {},
    create: { name: 'General English', subjectId: subject.id },
  })

  const intermediate = await prisma.level.upsert({
    where: { courseId_name: { courseId: course.id, name: 'Intermediate' } },
    update: {},
    create: { name: 'Intermediate', courseId: course.id },
  })

  await prisma.level.upsert({
    where: { courseId_name: { courseId: course.id, name: 'Elementary' } },
    update: {},
    create: { name: 'Elementary', courseId: course.id },
  })

  let group = await prisma.group.findFirst({ where: { name: 'Intermediate 01' } })
  if (!group) {
    group = await prisma.group.create({
      data: {
        name: 'Intermediate 01',
        levelId: intermediate.id,
        teacherId: teacher.id,
        scheduleDays: ['MON', 'WED', 'FRI'],
        scheduleTime: '18:00',
        startDate: new Date('2026-09-01'),
        status: 'ACTIVE',
      },
    })
  }

  const studentsData = [
    { firstName: 'Ali', lastName: 'Karimov', dob: new Date('2012-04-10') },
    { firstName: 'Madina', lastName: 'Yusupova', dob: new Date('2011-08-22') },
    { firstName: 'Aziz', lastName: 'Rashidov', dob: new Date('2012-01-15') },
  ]

  for (const data of studentsData) {
    const existing = await prisma.student.findFirst({
      where: { firstName: data.firstName, lastName: data.lastName },
    })
    if (existing) continue

    const student = await prisma.student.create({ data })
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        groupId: group.id,
        subjectId: subject.id,
        startDate: new Date('2026-09-01'),
        status: 'ACTIVE',
      },
    })

    const parent = await prisma.parent.create({
      data: { fullName: `${data.firstName}'s Parent`, phone: '+998900000000' },
    })
    await prisma.parentStudentLink.create({
      data: { parentId: parent.id, studentId: student.id },
    })
  }

  console.log('Seed complete:', {
    admin: admin.username,
    teacher: teacherUser.username,
    subject: subject.name,
    group: group.name,
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
