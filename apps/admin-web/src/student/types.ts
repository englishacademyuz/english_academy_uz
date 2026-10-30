import type { AttendanceStatus, LessonMaterialType } from '../lib/types'

export type GroupSummary = {
  name: string
  level: string
  /** The level's "#rrggbb" -- the Mini App paints the schedule and lesson dates in it. */
  levelColor: string
  teacher: string
  /** Null when the center hasn't entered one -- the call button is hidden then. */
  teacherPhone: string | null
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

/** The students this phone may open -- more than one when siblings share it. */
export type MiniAccounts = {
  /** The one the phone chose last (the bot takes its homework and messages for them). */
  current: string
  accounts: Array<{
    id: string
    firstName: string
    lastName: string
    group: { name: string; levelColor: string } | null
  }>
}

export type MiniHome = {
  student: { firstName: string; lastName: string }
  group: GroupSummary | null
  scheduleChanges: MiniScheduleChange[]
  lastLesson: { id: string; date: string; topic: string | null } | null
  latestHomework: {
    lessonId: string
    date: string
    topic: string | null
    instructions: string
    dueDate: string | null
    images: MiniHomeworkImage[]
    /** Tasks the student handed in that weren't sent back -- no need to hurry them on those. */
    handedIn: string[]
  } | null
  openQuizzes: MiniQuiz[]
  monthProgress: MiniProgressSnapshot
  totalPoints: number
  groupRanking: MiniGroupRanking | null
  payment: MiniPaymentReminder | null
  /** Teacher answers in the family chat not yet opened here. */
  unreadChat: number
  /** The newest news, events and notices still worth a place on the home screen. */
  announcements: MiniAnnouncement[]
}

/** News, an event, or an organizational notice (e.g. collecting for a new whiteboard) sent to the student's group. */
export type MiniAnnouncement = {
  id: string
  kind: 'NEWS' | 'EVENT' | 'ORGANIZATIONAL'
  title: string
  body: string
  /** EVENT: when it happens. */
  eventAt: string | null
  /** ORGANIZATIONAL: what each family is asked to bring, in so'm. */
  amount: number | null
  image: { width: number | null; height: number | null } | null
  authorName: string
  createdAt: string
}

/** A payment coming up in 3 days or less, or overdue -- `debtor` once 5 days past the payment day. */
export type MiniPaymentReminder = {
  stage: 'upcoming' | 'due' | 'overdue' | 'debtor'
  dueDate: string
  daysLeft: number
  unpaidCycles: number
  amount: number
}

export type MiniLessons = {
  group: GroupSummary | null
  scheduleChanges: MiniScheduleChange[]
  lessons: Array<{ id: string; date: string; topic: string | null; materialCount: number; hasHomework: boolean }>
  hasMore: boolean
}

export type MiniLessonDetail = {
  id: string
  date: string
  topic: string | null
  group: string
  notes: string | null
  materials: Array<{ id: string; type: LessonMaterialType; content: string }>
  homework:
    | {
        instructions: string
        dueDate: string | null
        images: MiniHomeworkImage[]
        submissionEnabled: boolean
        tasks: MiniHomeworkTask[]
      }
    | null
}

/** A picture the teacher gave with homework -- a task of its own, with a title, caption and deadline. */
export type MiniHomeworkImage = {
  id: string
  title: string | null
  caption: string | null
  dueDate: string | null
  width: number | null
  height: number | null
}

/** The task key of the written homework -- a picture task's key is the picture's id. */
export const WRITTEN_TASK = 'written'

/**
 * One thing to hand in, on its own deadline: the written homework (no name) or one picture
 * task -- with what the student handed in for it.
 */
export type MiniHomeworkTask = {
  task: string
  imageId: string | null
  /** The picture's title, else "2-vazifa"; null for the written homework. */
  name: string | null
  dueDate: string | null
  submission: MiniSubmission | null
}

/** The student's photos, voice notes and videos for one homework task: waiting for the teacher, checked, or sent back to redo. */
export type MiniSubmission = {
  id: string
  task: string
  status: 'SUBMITTED' | 'CHECKED' | 'RETURNED'
  submittedAt: string
  checkedAt: string | null
  teacherComment: string | null
  /** Handed in after the due date -- still accepted. */
  late: boolean
  photos: Array<{ id: string; width: number | null; height: number | null }>
  /** `duration` in seconds. */
  voices: Array<{ id: string; duration: number }>
  /** `round` for a round video message; `duration` in seconds. */
  videos: Array<{ id: string; duration: number; round: boolean; width: number | null; height: number | null }>
  /** The teacher's spoken feedback, if they recorded one; `duration` in seconds. */
  feedbackVoice: { id: string; duration: number } | null
}

export type MiniHomework = {
  lessonId: string
  date: string
  topic: string | null
  instructions: string
  dueDate: string | null
  images: MiniHomeworkImage[]
  /** The group takes homework through the platform (photos, voice notes, videos) -- otherwise it's only checked in class. */
  submissionEnabled: boolean
  /** Handed in task by task, the written homework first. */
  tasks: MiniHomeworkTask[]
}

export type MiniHomeworkDetail = Omit<MiniHomework, 'dueDate' | 'tasks'> & {
  group: string
  maxPhotos: number
  maxVoices: number
  maxVideos: number
  /** botTarget: a voice note or video sent to the bot now lands on this task. */
  tasks: Array<MiniHomeworkTask & { botTarget: boolean }>
}

export type MiniMark = {
  id: string
  kind: 'assessment' | 'quiz'
  date: string
  title: string
  category: string
  score: number
  maxScore: number
}

export type MiniAttendance = {
  rate: number | null
  totals: Record<AttendanceStatus, number>
  days: Array<{ lessonId: string; date: string; topic: string | null; group: string; status: AttendanceStatus | null }>
  /** Assessment results and finished quizzes dated in the month, newest first. */
  marks: MiniMark[]
}

/** One month of the academic year, for the Kundalik year view. `lessons` excludes excused absences. */
export type MiniYearMonth = {
  year: number
  month: number
  lessons: number
  attended: number
  attendanceRate: number | null
  markAverage: number | null
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

/** An upcoming lesson of the student's group moved to another day/time. Dates are UTC-midnight ISO days. */
export type MiniScheduleChange = {
  id: string
  originalDate: string
  regularTime: string
  newDate: string
  newTime: string
  reason: string | null
}

/** One classmate on the group's points table -- names only, the student's own row flagged. */
export type MiniRankRow = { name: string; points: number; place: number; isMe: boolean }

export type MiniGroupRanking = { myPlace: number | null; myPoints: number; rows: MiniRankRow[] }

/** One message of the family chat. `mine` is this Telegram account's own; other family messages come from the student's other linked chats. */
export type MiniChatMessage = {
  id: string
  fromFamily: boolean
  mine: boolean
  senderName: string
  text: string
  createdAt: string
}

export type MiniChat = {
  teacher: { name: string; phone: string | null } | null
  messages: MiniChatMessage[]
}
