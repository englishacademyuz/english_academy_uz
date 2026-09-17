export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT'
export type StudentStatus = 'ACTIVE' | 'PAUSED' | 'INACTIVE' | 'COMPLETED' | 'LEFT'
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
export type HomeworkResultStatus = 'COMPLETED' | 'NOT_COMPLETED'
export type AssessmentType = 'WEEKLY' | 'MONTHLY' | 'GENERAL' | 'CUSTOM'
export type LessonMaterialType = 'PDF' | 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'LINK' | 'TEXT'
export type EnrollmentEndReason = 'GROUP_CHANGE' | 'STUDENT_LEFT' | 'COMPLETED' | 'OTHER'

export type Actor = {
  userId: string
  role: Role
  studentId?: string
  parentId?: string
  teacherId?: string
}

export type Subject = { id: string; name: string; courses?: Course[] }
export type Course = { id: string; subjectId: string; name: string; levels?: Level[] }
export type Level = { id: string; courseId: string; name: string }

export type Teacher = { id: string; fullName: string; userId: string }

export type Student = {
  id: string
  firstName: string
  lastName: string
  dob: string
  phone?: string | null
  status: StudentStatus
  enrollments?: Enrollment[]
  parentLinks?: ParentStudentLink[]
}

export type Parent = { id: string; fullName: string; phone?: string | null }

export type ParentStudentLink = {
  id: string
  parentId: string
  studentId: string
  linkedAt: string
  unlinkedAt: string | null
}

export type Group = {
  id: string
  levelId: string
  teacherId: string
  name: string
  scheduleDays: string[]
  scheduleTime: string
  startDate: string
  status: string
  level?: Level
  teacher?: Teacher
  enrollments?: Enrollment[]
}

export type Enrollment = {
  id: string
  studentId: string
  groupId: string
  subjectId: string
  startDate: string
  endDate: string | null
  status: 'ACTIVE' | 'ENDED'
  endReason: EnrollmentEndReason | null
  student?: Student
}

export type LessonMaterial = { id: string; type: LessonMaterialType; content: string }
export type Homework = { id: string; instructions: string; dueDate: string | null }
export type Attendance = { id: string; studentId: string; status: AttendanceStatus }

export type LessonSession = {
  id: string
  groupId: string
  teacherId: string
  date: string
  topic: string | null
  notes: string | null
  materials: LessonMaterial[]
  homework: Homework | null
  attendances: Attendance[]
}

export type AssessmentCategory = { id: string; levelId: string; name: string; retiredAt: string | null }

export type AssessmentResult = { id: string; studentId: string; score: number }

export type Assessment = {
  id: string
  groupId: string
  categoryId: string
  title: string
  type: AssessmentType
  date: string
  maxScore: number
  category?: AssessmentCategory
  results: AssessmentResult[]
}
