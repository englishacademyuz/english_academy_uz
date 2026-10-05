import type {
  Actor,
  Assessment,
  AssessmentCategory,
  AssessmentCategoryCadence,
  AssessmentType,
  AttendanceStatus,
  ChatMessage,
  ChatUnreadSummary,
  ConversationListItem,
  ConversationThread,
  Course,
  Enrollment,
  EnrollmentEndReason,
  Group,
  GroupLeaderboardEntry,
  GroupPaymentEntry,
  GroupPaymentHistory,
  HomeworkFeed,
  HomeworkImage,
  HomeworkSubmission,
  HomeworkSubmissionStatus,
  LessonHomeworkSubmissions,
  Level,
  LessonMaterialType,
  LessonReschedule,
  LessonSession,
  Payment,
  PointActivityType,
  PointTransaction,
  QuizDetail,
  QuizInput,
  QuizSummary,
  Student,
  StudentListItem,
  StudentOverview,
  StudentStatus,
  Subject,
  Teacher,
} from './types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    // Only set Content-Type when there's an actual body -- Fastify rejects
    // an empty body sent with 'application/json' as a 400, and sending the
    // header unconditionally on no-body POSTs (logout, issue-linking-code)
    // used to trip that.
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // response had no JSON body -- fall back to statusText
    }
    throw new ApiError(message, res.status)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const get = <T>(path: string) => apiFetch<T>(path)
const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
const patch = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined })
const put = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) })
const del = <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' })

export const auth = {
  login: (username: string, password: string) => post<{ id: string; role: string }>('/auth/login', { username, password }),
  logout: () => post<{ ok: true }>('/auth/logout'),
  me: () => get<Actor>('/auth/me'),
}

export const subjects = {
  list: () => get<Subject[]>('/subjects'),
  create: (name: string) => post<Subject>('/subjects', { name }),
  rename: (id: string, name: string) => patch<Subject>(`/subjects/${id}`, { name }),
  remove: (id: string) => del<{ ok: true }>(`/subjects/${id}`),
}

export const courses = {
  list: (subjectId?: string) => get<Course[]>(`/courses${subjectId ? `?subjectId=${subjectId}` : ''}`),
  create: (subjectId: string, name: string) => post<Course>(`/subjects/${subjectId}/courses`, { name }),
  rename: (id: string, name: string) => patch<Course>(`/courses/${id}`, { name }),
  remove: (id: string) => del<{ ok: true }>(`/courses/${id}`),
}

export const levels = {
  list: (courseId?: string) => get<Level[]>(`/levels${courseId ? `?courseId=${courseId}` : ''}`),
  create: (courseId: string, name: string) => post<Level>(`/courses/${courseId}/levels`, { name }),
  rename: (id: string, name: string) => patch<Level>(`/levels/${id}`, { name }),
  remove: (id: string) => del<{ ok: true }>(`/levels/${id}`),
}

export const teachers = {
  list: () => get<Teacher[]>('/teachers'),
  create: (data: { fullName: string; username: string; password: string; phone?: string }) =>
    post<Teacher>('/teachers', data),
  update: (id: string, data: { fullName?: string; phone?: string }) => patch<Teacher>(`/teachers/${id}`, data),
}

export const students = {
  list: (status?: StudentStatus) => get<StudentListItem[]>(`/students${status ? `?status=${status}` : ''}`),
  get: (id: string) => get<Student>(`/students/${id}`),
  overview: (id: string) => get<StudentOverview>(`/students/${id}/overview`),
  create: (data: { firstName: string; lastName: string; age: number; phone?: string; joinedAt?: string }) =>
    post<Student>('/students', data),
  update: (
    id: string,
    data: Partial<{ firstName: string; lastName: string; age: number; phone: string; joinedAt: string; status: StudentStatus }>,
  ) =>
    patch<Student>(`/students/${id}`, data),
  issueLinkingCode: (id: string) => post<{ code: string }>(`/students/${id}/linking-code`),
  /** Deletes the student with all their records -- can't be undone. */
  remove: (id: string) => del<{ ok: true }>(`/students/${id}`),
}

export type GroupInput = {
  levelId: string
  teacherId: string
  name: string
  scheduleDays: string[]
  scheduleTime: string
  startDate: string
  monthlyFee?: number
  homeworkSubmissionEnabled?: boolean
}

export const groups = {
  list: () => get<Group[]>('/groups'),
  get: (id: string) => get<Group>(`/groups/${id}`),
  create: (data: GroupInput) => post<Group>('/groups', data),
  update: (id: string, data: Partial<GroupInput>) => patch<Group>(`/groups/${id}`, data),
  // Archives the group server-side: history stays, the future timetable is cleared.
  remove: (id: string) => del<{ ok: true }>(`/groups/${id}`),
}

type NotifyResult = { notifiedChats: number | null }

export const reschedules = {
  list: (from: string, to: string) => get<LessonReschedule[]>(`/reschedules?from=${from}&to=${to}`),
  save: (
    groupId: string,
    data: { originalDate: string; newDate: string; newTime: string; reason?: string; notify?: boolean },
  ) => put<LessonReschedule & NotifyResult>(`/groups/${groupId}/reschedules`, data),
  notify: (id: string) => post<LessonReschedule & NotifyResult>(`/reschedules/${id}/notify`),
  cancel: (id: string, notify?: boolean) =>
    del<{ ok: true } & NotifyResult>(`/reschedules/${id}${notify === undefined ? '' : `?notify=${notify}`}`),
}

export const enrollments = {
  enroll: (groupId: string, studentId: string, startDate: string) =>
    post<Enrollment>(`/groups/${groupId}/enrollments`, { studentId, startDate }),
  end: (enrollmentId: string, endDate: string, endReason: EnrollmentEndReason) =>
    patch<Enrollment>(`/enrollments/${enrollmentId}/end`, { endDate, endReason }),
  changeGroup: (enrollmentId: string, toGroupId: string, changeDate: string) =>
    patch<Enrollment>(`/enrollments/${enrollmentId}/change-group`, { toGroupId, changeDate }),
}

export const sessions = {
  // `date` picks one exact day; `from`/`to` picks a range (e.g. one calendar month) --
  // pass whichever shape fits, never both.
  listForGroup: (groupId: string, params?: { date?: string; from?: string; to?: string }) => {
    const query = new URLSearchParams()
    if (params?.date) query.set('date', params.date)
    if (params?.from) query.set('from', params.from)
    if (params?.to) query.set('to', params.to)
    const qs = query.toString()
    return get<LessonSession[]>(`/groups/${groupId}/sessions${qs ? `?${qs}` : ''}`)
  },
  get: (id: string) => get<LessonSession>(`/sessions/${id}`),
  record: (
    groupId: string,
    data: {
      date: string
      topic?: string
      notes?: string
      materials?: Array<{ type: LessonMaterialType; content: string }>
      // `images` lists the homework's pictures in order; leaving it out keeps them as they are.
      homework?: {
        instructions: string
        dueDate?: string
        images?: Array<{ id: string; title: string | null; caption: string | null; dueDate: string | null }>
      }
      attendance?: Array<{ studentId: string; status: AttendanceStatus }>
    },
  ) => post<LessonSession>(`/groups/${groupId}/sessions`, data),
}

export const assessmentCategories = {
  list: (levelId: string) => get<AssessmentCategory[]>(`/levels/${levelId}/assessment-categories`),
  create: (levelId: string, name: string, maxScore: number, pointsWorth: number, cadence: AssessmentCategoryCadence) =>
    post<AssessmentCategory>(`/levels/${levelId}/assessment-categories`, { name, maxScore, pointsWorth, cadence }),
  retire: (id: string) => patch<AssessmentCategory>(`/assessment-categories/${id}/retire`),
}

export const assessments = {
  // `date` picks one exact day; `from`/`to` picks a range (e.g. one calendar month) --
  // pass whichever shape fits, never both.
  listForGroup: (groupId: string, params?: { date?: string; from?: string; to?: string }) => {
    const query = new URLSearchParams()
    if (params?.date) query.set('date', params.date)
    if (params?.from) query.set('from', params.from)
    if (params?.to) query.set('to', params.to)
    const qs = query.toString()
    return get<Assessment[]>(`/groups/${groupId}/assessments${qs ? `?${qs}` : ''}`)
  },
  // Upserts on (group, category, date, title) server-side -- safe to call
  // repeatedly for the same cell. `maxScore` is optional and falls back to
  // the category's own configured scale.
  create: (
    groupId: string,
    data: {
      categoryId: string
      title: string
      type: AssessmentType
      date: string
      maxScore?: number
      results?: Array<{ studentId: string; score: number }>
    },
  ) => post<Assessment>(`/groups/${groupId}/assessments`, data),
  recordResults: (assessmentId: string, results: Array<{ studentId: string; score: number }>) =>
    post<unknown>(`/assessments/${assessmentId}/results`, { results }),
}

export const payments = {
  listForStudent: (studentId: string) => get<{ payments: Payment[]; outstanding: number }>(`/students/${studentId}/payments`),
  record: (
    studentId: string,
    data: { year: number; month: number; amountDue: number; amountPaid?: number; note?: string },
  ) => post<Payment>(`/students/${studentId}/payments`, data),
  update: (paymentId: string, data: Partial<{ amountDue: number; amountPaid: number; note: string }>) =>
    patch<Payment>(`/payments/${paymentId}`, data),
  forGroup: (groupId: string, year: number, month: number) =>
    get<GroupPaymentEntry[]>(`/groups/${groupId}/payments?year=${year}&month=${month}`),
  historyForGroup: (groupId: string) => get<GroupPaymentHistory>(`/groups/${groupId}/payments-history`),
  /** Sends the student's Telegram chats a reminder about the payment that is due. */
  remind: (studentId: string) =>
    post<{ notifiedChats: number; remindedAt: string }>(`/students/${studentId}/payment-reminder`),
}

export const attendances = {
  /** Tells the student's Telegram chats they missed this lesson. */
  notifyAbsence: (attendanceId: string) =>
    post<{ notifiedChats: number; notifiedAt: string }>(`/attendances/${attendanceId}/absence-notice`),
}

export const points = {
  listForStudent: (studentId: string) =>
    get<{ transactions: PointTransaction[]; total: number }>(`/students/${studentId}/points`),
  award: (
    groupId: string,
    data: { studentId: string; activityType: PointActivityType; points: number; note?: string },
  ) => post<PointTransaction>(`/groups/${groupId}/points`, data),
  leaderboardForGroup: (groupId: string, range?: { start: Date; end: Date }) => {
    const query = range ? `?start=${range.start.toISOString()}&end=${range.end.toISOString()}` : ''
    return get<GroupLeaderboardEntry[]>(`/groups/${groupId}/leaderboard${query}`)
  },
}

export const quizzes = {
  listForGroup: (groupId: string, params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams()
    if (params?.from) query.set('from', params.from)
    if (params?.to) query.set('to', params.to)
    const qs = query.toString()
    return get<QuizSummary[]>(`/groups/${groupId}/quizzes${qs ? `?${qs}` : ''}`)
  },
  get: (id: string) => get<QuizDetail>(`/quizzes/${id}`),
  create: (groupId: string, date: string, input: QuizInput) =>
    post<QuizDetail>(`/groups/${groupId}/quizzes`, { date, ...input }),
  update: (id: string, input: QuizInput) => put<QuizDetail>(`/quizzes/${id}`, input),
  remove: (id: string) => del<{ ok: true }>(`/quizzes/${id}`),
  send: (id: string, deadline: string) =>
    post<{ id: string; notifiedChats: number }>(`/quizzes/${id}/send`, { deadline }),
  close: (id: string) => post<QuizDetail>(`/quizzes/${id}/close`),
}

/** Object URLs of homework photos already fetched this session -- they never change. */
const photoUrls = new Map<string, Promise<string>>()

export const homeworkSubmissions = {
  forLesson: (sessionId: string) => get<LessonHomeworkSubmissions>(`/sessions/${sessionId}/homework-submissions`),
  forGroup: (
    groupId: string,
    params: { from?: string; to?: string; q?: string; status?: HomeworkSubmissionStatus; page?: number } = {},
  ) => {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value))
    const qs = query.toString()
    return get<HomeworkFeed>(`/groups/${groupId}/homework-submissions${qs ? `?${qs}` : ''}`)
  },
  /** Submissions waiting for a teacher, per group. */
  unchecked: () => get<{ total: number; byGroup: Record<string, number> }>('/homework-submissions/unchecked'),
  /** Checked, or sent back to redo -- the student's Telegram chats are told either way. */
  review: (id: string, status: 'CHECKED' | 'RETURNED', comment?: string) =>
    post<HomeworkSubmission>(`/homework-submissions/${id}/review`, { status, comment: comment ?? null }),
  photoUrl: (photoId: string) => {
    let url = photoUrls.get(photoId)
    if (!url) {
      url = fetch(`${BASE_URL}/homework-photos/${photoId}`, { credentials: 'include' }).then(async (res) => {
        if (!res.ok) throw new ApiError(res.statusText, res.status)
        return URL.createObjectURL(await res.blob())
      })
      url.catch(() => photoUrls.delete(photoId))
      photoUrls.set(photoId, url)
    }
    return url
  },
}

/** Object URLs of homework pictures already fetched this session -- they never change. */
const imageUrls = new Map<string, Promise<string>>()

/** Pictures a teacher hands out with homework: uploaded one at a time, attached by saving the lesson. */
export const homeworkImages = {
  upload: async (groupId: string, image: Blob) => {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/homework-images`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': image.type || 'image/jpeg' },
      body: image,
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new ApiError(body?.error ?? res.statusText, res.status)
    }
    return (await res.json()) as HomeworkImage
  },
  url: (imageId: string) => {
    let url = imageUrls.get(imageId)
    if (!url) {
      url = fetch(`${BASE_URL}/homework-images/${imageId}`, { credentials: 'include' }).then(async (res) => {
        if (!res.ok) throw new ApiError(res.statusText, res.status)
        return URL.createObjectURL(await res.blob())
      })
      url.catch(() => imageUrls.delete(imageId))
      imageUrls.set(imageId, url)
    }
    return url
  },
}

export const conversations = {
  list: () => get<ConversationListItem[]>('/conversations'),
  unread: () => get<ChatUnreadSummary>('/conversations/unread'),
  /** Opening a thread marks it read for the signed-in user. */
  thread: (studentId: string) => get<ConversationThread>(`/students/${studentId}/conversation`),
  /** Saves the message and delivers it to every Telegram chat linked to the student. */
  send: (studentId: string, text: string) =>
    post<ChatMessage & { deliveredChats: number }>(`/students/${studentId}/conversation/messages`, { text }),
}
