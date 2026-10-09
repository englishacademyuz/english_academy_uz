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
export type Level = { id: string; courseId: string; name: string; color: string; course?: Course }

export type Teacher = { id: string; fullName: string; phone: string | null; userId: string }

export type Student = {
  id: string
  firstName: string
  lastName: string
  dob: string
  phone?: string | null
  status: StudentStatus
  /** The day they joined -- their own monthly payment day. */
  joinedAt: string
  paymentRemindedAt?: string | null
  /** Set when tied with siblings who share one phone. */
  familyId?: string | null
  enrollments?: Enrollment[]
}

export type StudentFamily = {
  familyId: string | null
  students: Array<{ id: string; firstName: string; lastName: string; status: StudentStatus }>
}

/** A payment that is coming up (within 3 days) or overdue -- see @tashkurgan/shared/billing. */
export type StudentPaymentReminder = {
  stage: 'upcoming' | 'due' | 'overdue' | 'debtor'
  year: number
  month: number
  dueDate: string
  daysLeft: number
  unpaidCycles: number
  amount: number
  remindedAt: string | null
}


export type Group = {
  id: string
  levelId: string
  teacherId: string
  name: string
  scheduleDays: string[]
  scheduleTime: string
  startDate: string
  /** Monthly course fee in so'm; 0 = not set. */
  monthlyFee: number
  /** Students may hand in homework through the platform -- photos and voice notes, via Telegram. */
  homeworkSubmissionEnabled: boolean
  status: string
  archivedAt?: string | null
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

export type HomeworkSubmissionStatus = 'SUBMITTED' | 'CHECKED' | 'RETURNED'

/** One student's photos, voice notes and videos for one homework, as the teacher reviews them. */
export type HomeworkSubmission = {
  id: string
  status: HomeworkSubmissionStatus
  submittedAt: string
  checkedAt: string | null
  teacherComment: string | null
  /** Handed in after the due date. */
  late: boolean
  photos: Array<{ id: string; width: number | null; height: number | null }>
  /** Voice notes (speaking homework); `duration` in seconds. */
  voices: Array<{ id: string; duration: number }>
  /** Videos (round video messages or regular ones); `duration` in seconds. */
  videos: HomeworkVideoFile[]
}

export type HomeworkVideoFile = { id: string; duration: number; round: boolean; width: number | null; height: number | null }

export type SubmissionStudent = { id: string; firstName: string; lastName: string }

/** One lesson's homework with every student of the group then. */
export type LessonHomeworkSubmissions = {
  lessonId: string
  date: string
  topic: string | null
  homework: { instructions: string; dueDate: string | null } | null
  students: Array<{ student: SubmissionStudent; submission: HomeworkSubmission | null }>
}

export type HomeworkFeedItem = HomeworkSubmission & {
  student: SubmissionStudent
  lesson: { id: string; date: string; topic: string | null }
}

export type HomeworkFeed = { items: HomeworkFeedItem[]; hasMore: boolean; uncheckedCount: number }
/** A picture the teacher hands out with homework -- a task of its own, with a title, caption and deadline. */
export type HomeworkImage = {
  id: string
  title: string | null
  caption: string | null
  dueDate: string | null
  width: number | null
  height: number | null
}

export type Homework = { id: string; instructions: string; dueDate: string | null; images: HomeworkImage[] }
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
  payments: { list: Payment[]; outstanding: number; reminder: StudentPaymentReminder | null }
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

/** One regular lesson moved to another day/time. Dates are calendar days (UTC midnight ISO). */
export type LessonReschedule = {
  id: string
  groupId: string
  originalDate: string
  newDate: string
  newTime: string
  reason: string | null
  notifiedAt: string | null
}

/** A row of the students list -- the student plus their current group(s), rating and attendance. */
/** The student's latest lesson, when they missed it. */
export type StudentAbsence = {
  attendanceId: string
  date: string
  groupName: string
  notifiedAt: string | null
}

export type StudentListItem = Student & {
  groups: Array<{ id: string; name: string; level: { name: string; color: string } }>
  points: number
  attendance: { totals: Record<AttendanceStatus, number>; rate: number | null }
  paymentReminder: StudentPaymentReminder | null
  lastAbsence: StudentAbsence | null
}

/** The student a family chat is about, with their current groups -- the chat header's info card. */
export type ChatStudent = {
  id: string
  firstName: string
  lastName: string
  dob: string
  phone: string | null
  status: StudentStatus
  groups: Array<{ id: string; name: string; level: string; levelColor: string; teacher: string }>
}

export type ChatSender = 'FAMILY' | 'STAFF'

export type ChatMessage = {
  id: string
  sender: ChatSender
  /** A family message: the Telegram account's name. A staff one: the teacher's full name, or "Administrator". */
  senderName: string
  text: string
  createdAt: string
}

export type ConversationListItem = {
  studentId: string
  student: ChatStudent
  lastMessage: Omit<ChatMessage, 'id'> | null
  lastMessageAt: string
  /** Family messages this staff member hasn't opened yet. */
  unread: number
}

export type ConversationThread = {
  student: ChatStudent
  linkedChats: number
  /** Staff messages up to here have been opened by the family in the Mini App. */
  familyReadAt: string | null
  messages: ChatMessage[]
}

export type ChatUnreadSummary = {
  conversations: number
  messages: number
  latest: { studentId: string; studentName: string; senderName: string; text: string; createdAt: string } | null
}
