export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT'
export type StudentStatus = 'ACTIVE' | 'PAUSED' | 'INACTIVE' | 'COMPLETED' | 'LEFT'
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
export type HomeworkResultStatus = 'COMPLETED' | 'NOT_COMPLETED'
export type AssessmentType = 'WEEKLY' | 'MONTHLY' | 'GENERAL' | 'CUSTOM'
export type AssessmentCategoryCadence = 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type LessonMaterialType = 'PDF' | 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'LINK' | 'TEXT'
export type EnrollmentEndReason = 'GROUP_CHANGE' | 'STUDENT_LEFT' | 'COMPLETED' | 'OTHER'
export type PaymentStatus = 'DEBT' | 'PARTIAL' | 'PAID'
export type PointActivityType = 'HOMEWORK' | 'PARTICIPATION' | 'QUIZ' | 'ASSESSMENT' | 'ATTENDANCE' | 'OTHER'

export type Actor = {
  userId: string
  role: Role
  studentId?: string
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
  cadence: AssessmentCategoryCadence
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

export type StudentOverviewQuizResult = {
  id: string
  quizTitle: string
  date: string
  group: Group
  correctCount: number
  totalQuestions: number
  points: number
}

export type StudentOverview = {
  student: Student
  enrollments: Enrollment[]
  telegramLinkCount: number
  attendance: {
    totals: Record<AttendanceStatus, number>
    rate: number | null
    records: StudentOverviewAttendanceEntry[]
  }
  lessonDays: Array<{ id: string; date: string; group: { id: string; name: string } }>
  assessmentResults: StudentOverviewAssessmentResult[]
  quizResults: StudentOverviewQuizResult[]
  payments: { list: Payment[]; outstanding: number }
  points: { total: number; recent: PointTransaction[] }
}

export type GroupLeaderboardEntry = { student: Student; points: number }
export type GroupPaymentEntry = { student: Student; payment: Payment | null }
export type GroupPaymentHistory = { students: Student[]; payments: Payment[] }

export type QuizStatus = 'DRAFT' | 'SENT'

export type QuizOptionInput = { text: string; isCorrect: boolean }
export type QuizQuestionInput = { text: string; options: QuizOptionInput[] }
export type QuizInput = { title: string; maxPoints: number; questions: QuizQuestionInput[] }

/** One row of a group's quiz list -- with a light per-student summary for the marks table. */
export type QuizSummary = {
  id: string
  date: string
  title: string
  maxPoints: number
  status: QuizStatus
  sentAt: string | null
  deadline: string | null
  isOpen: boolean
  questionCount: number
  attempts: Array<{ studentId: string; completedAt: string | null; correctCount: number | null; points: number | null }>
}

export type QuizResultRow = {
  student: { id: string; firstName: string; lastName: string }
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'
  answeredCount: number
  correctCount: number | null
  points: number | null
}

export type QuizDetail = {
  id: string
  lessonSessionId: string
  date: string
  title: string
  maxPoints: number
  status: QuizStatus
  sentAt: string | null
  deadline: string | null
  isOpen: boolean
  questions: Array<{
    id: string
    position: number
    text: string
    options: Array<{ id: string; position: number; text: string; isCorrect: boolean }>
  }>
  results: QuizResultRow[]
}
