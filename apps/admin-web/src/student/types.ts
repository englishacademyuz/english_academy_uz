import type { AttendanceStatus, LessonMaterialType } from '../lib/types'

export type ProgressKind = 'today' | 'week' | 'month'

export type GroupSummary = {
  name: string
  level: string
  teacher: string
  scheduleDays: string[]
  scheduleTime: string
}

export type MiniQuiz = {
  id: string
  title: string
  date: string
  deadline: string | null
  isOpen: boolean
  questionCount: number
  maxPoints: number
  attempt: { completed: boolean; answeredCount: number; correctCount: number | null; points: number | null } | null
}

export type MiniProgressSnapshot = {
  attendanceRate: number | null
  quizAverage: number | null
  academicByCategory: Record<string, number>
  points: number
}

export type MiniHome = {
  student: { firstName: string; lastName: string }
  group: GroupSummary | null
  lastLesson: { id: string; date: string; topic: string | null } | null
  latestHomework: { lessonId: string; date: string; topic: string | null; instructions: string; dueDate: string | null } | null
  openQuizzes: MiniQuiz[]
  monthProgress: MiniProgressSnapshot
  totalPoints: number
}

export type MiniLessons = {
  group: GroupSummary | null
  lessons: Array<{ id: string; date: string; topic: string | null; materialCount: number; hasHomework: boolean }>
  hasMore: boolean
}

export type MiniLessonDetail = {
  id: string
  date: string
  topic: string | null
  group: string
  materials: Array<{ id: string; type: LessonMaterialType; content: string }>
  homework: { instructions: string; dueDate: string | null } | null
}

export type MiniHomework = { lessonId: string; date: string; topic: string | null; instructions: string; dueDate: string | null }

export type MiniMark = {
  id: string
  kind: 'assessment' | 'quiz'
  date: string
  title: string
  category: string
  score: number
  maxScore: number
}

export type MiniProgress = MiniProgressSnapshot & { marks: MiniMark[] }

export type MiniAttendance = {
  rate: number | null
  totals: Record<AttendanceStatus, number>
  days: Array<{ lessonId: string; date: string; topic: string | null; group: string; status: AttendanceStatus | null }>
}

export type MiniProfile = {
  student: { firstName: string; lastName: string; dob: string; phone: string | null; status: string }
  group: GroupSummary | null
  memberSince: string | null
  totalPoints: number
  linkedAccounts: number
}

export type AttemptReview = {
  quizTitle: string
  correctCount: number
  total: number
  points: number
  maxPoints: number
  questions: Array<{ text: string; chosen: string | null; correct: string; isCorrect: boolean }>
}

export type AttemptState =
  | {
      kind: 'question'
      attemptId: string
      quizTitle: string
      index: number
      total: number
      question: { id: string; text: string; options: Array<{ id: string; text: string }> }
    }
  | { kind: 'completed'; review: AttemptReview }
