export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT'
export type StudentStatus = 'ACTIVE' | 'PAUSED' | 'INACTIVE' | 'COMPLETED' | 'LEFT'
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
export type HomeworkResultStatus = 'COMPLETED' | 'NOT_COMPLETED'
export type AssessmentType = 'WEEKLY' | 'MONTHLY' | 'GENERAL' | 'CUSTOM'
export type LessonMaterialType = 'PDF' | 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'LINK' | 'TEXT'
export type EnrollmentEndReason = 'GROUP_CHANGE' | 'STUDENT_LEFT' | 'COMPLETED' | 'OTHER'
export type PaymentStatus = 'DEBT' | 'PARTIAL' | 'PAID'
export type PointActivityType = 'HOMEWORK' | 'PARTICIPATION' | 'QUIZ' | 'ASSESSMENT' | 'ATTENDANCE' | 'OTHER'

export type Actor = {
  userId: string
  role: Role
  studentId?: string
  parentId?: string
  teacherId?: string
}

export type Subject = { id: string; name: string; courses?: Course[] }
export type Course = { id: string; subjectId: string; name: string; levels?: Level[]; subject?: Subject }
export type Level = { id: string; courseId: string; name: string; course?: Course }

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
  group?: Group
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

export type AssessmentCategory = {
  id: string
  levelId: string
  name: string
  maxScore: number
  pointsWorth: number
  retiredAt: string | null
}

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

export type Payment = {
  id: string
  studentId: string
  year: number
  month: number
  amountDue: number
  amountPaid: number
  status: PaymentStatus
  paidAt: string | null
  recordedByUserId: string
  note: string | null
  createdAt: string
}

export type PointTransaction = {
  id: string
  studentId: string
  groupId: string
  activityType: PointActivityType
  points: number
  note: string | null
  createdAt: string
  group?: Group
}

export type StudentOverviewAttendanceEntry = {
  id: string
  status: AttendanceStatus
  lessonSession: { id: string; date: string; group: Group }
}

export type StudentOverviewAssessmentResult = AssessmentResult & {
  assessment: Assessment & { category: AssessmentCategory; group: Group }
}

export type StudentOverviewHomeworkResult = {
  id: string
  status: HomeworkResultStatus
  score: number | null
  teacherComment: string | null
  homework: { id: string; instructions: string; dueDate: string | null; lessonSession: { date: string; group: Group } }
}

export type StudentOverview = {
  student: Student
  enrollments: Enrollment[]
  parents: Array<ParentStudentLink & { parent: Parent }>
  attendance: {
    totals: Record<AttendanceStatus, number>
    rate: number | null
    recent: StudentOverviewAttendanceEntry[]
  }
  assessmentResults: StudentOverviewAssessmentResult[]
  homeworkResults: StudentOverviewHomeworkResult[]
  payments: { list: Payment[]; outstanding: number }
  points: { total: number; recent: PointTransaction[] }
}

export type GroupLeaderboardEntry = { student: Student; points: number }
export type GroupPaymentEntry = { student: Student; payment: Payment | null }
export type GroupPaymentHistory = { students: Student[]; payments: Payment[] }
