import { prisma } from '@tashkurgan/db'
import { ConflictError, NotFoundError } from '@tashkurgan/shared'

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === 'P2002'
const isNotFound = (err: unknown) => (err as { code?: string }).code === 'P2025'

async function rename<T>(update: () => Promise<T>, label: string): Promise<T> {
  try {
    return await update()
  } catch (err) {
    if (isNotFound(err)) throw new NotFoundError(`${label} not found`)
    if (isUniqueViolation(err)) throw new ConflictError(`A ${label.toLowerCase()} with this name already exists`)
    throw err
  }
}

export function renameSubject(id: string, name: string) {
  return rename(() => prisma.subject.update({ where: { id }, data: { name } }), 'Subject')
}

export function renameCourse(id: string, name: string) {
  return rename(() => prisma.course.update({ where: { id }, data: { name } }), 'Course')
}

export function renameLevel(id: string, name: string) {
  return rename(() => prisma.level.update({ where: { id }, data: { name } }), 'Level')
}

/**
 * Curriculum is only hard-deleted while nothing was ever taught under it: a Group
 * (archived ones too) keeps its Level as history, so any Group below blocks the
 * delete. Otherwise the item goes together with its empty Courses, Levels and
 * their AssessmentCategories -- which can't have Assessments without a Group.
 */
async function assertNeverTaught(levelIds: string[]) {
  const groups = await prisma.group.count({ where: { levelId: { in: levelIds } } })
  if (groups > 0) throw new ConflictError('Groups are (or were) taught here -- it cannot be deleted')
  return levelIds
}

export async function deleteLevel(id: string) {
  const level = await prisma.level.findUnique({ where: { id } })
  if (!level) throw new NotFoundError('Level not found')
  await assertNeverTaught([id])
  await prisma.$transaction([
    prisma.assessmentCategory.deleteMany({ where: { levelId: id } }),
    prisma.level.delete({ where: { id } }),
  ])
}

export async function deleteCourse(id: string) {
  const course = await prisma.course.findUnique({ where: { id }, include: { levels: { select: { id: true } } } })
  if (!course) throw new NotFoundError('Course not found')
  const levelIds = await assertNeverTaught(course.levels.map((l) => l.id))
  await prisma.$transaction([
    prisma.assessmentCategory.deleteMany({ where: { levelId: { in: levelIds } } }),
    prisma.level.deleteMany({ where: { courseId: id } }),
    prisma.course.delete({ where: { id } }),
  ])
}

export async function deleteSubject(id: string) {
  const subject = await prisma.subject.findUnique({
    where: { id },
    include: { courses: { select: { id: true, levels: { select: { id: true } } } } },
  })
  if (!subject) throw new NotFoundError('Subject not found')
  const levelIds = await assertNeverTaught(subject.courses.flatMap((c) => c.levels.map((l) => l.id)))
  // Enrollments always belong to a Group, so the Group check covers them too.
  await prisma.$transaction([
    prisma.assessmentCategory.deleteMany({ where: { levelId: { in: levelIds } } }),
    prisma.level.deleteMany({ where: { courseId: { in: subject.courses.map((c) => c.id) } } }),
    prisma.course.deleteMany({ where: { subjectId: id } }),
    prisma.subject.delete({ where: { id } }),
  ])
}
