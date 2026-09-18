import type {
  Actor,
  Assessment,
  AssessmentCategory,
  AssessmentType,
  AttendanceStatus,
  Course,
  Enrollment,
  EnrollmentEndReason,
  Group,
  GroupLeaderboardEntry,
  GroupPaymentEntry,
  GroupPaymentHistory,
  HomeworkResultStatus,
  Level,
  LessonMaterialType,
  LessonSession,
  Parent,
  ParentStudentLink,
  Payment,
  PointActivityType,
  PointTransaction,
  Student,
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

export const auth = {
  login: (username: string, password: string) => post<{ id: string; role: string }>('/auth/login', { username, password }),
  logout: () => post<{ ok: true }>('/auth/logout'),
  me: () => get<Actor>('/auth/me'),
}

export const subjects = {
  list: () => get<Subject[]>('/subjects'),
  create: (name: string) => post<Subject>('/subjects', { name }),
}

export const courses = {
  list: (subjectId?: string) => get<Course[]>(`/courses${subjectId ? `?subjectId=${subjectId}` : ''}`),
  create: (subjectId: string, name: string) => post<Course>(`/subjects/${subjectId}/courses`, { name }),
}

export const levels = {
  list: (courseId?: string) => get<Level[]>(`/levels${courseId ? `?courseId=${courseId}` : ''}`),
  create: (courseId: string, name: string) => post<Level>(`/courses/${courseId}/levels`, { name }),
}

export const teachers = {
  list: () => get<Teacher[]>('/teachers'),
  create: (data: { fullName: string; username: string; password: string }) => post<Teacher>('/teachers', data),
}

export const students = {
  list: (status?: StudentStatus) => get<Student[]>(`/students${status ? `?status=${status}` : ''}`),
  get: (id: string) => get<Student>(`/students/${id}`),
  overview: (id: string) => get<StudentOverview>(`/students/${id}/overview`),
  create: (data: { firstName: string; lastName: string; dob: string; phone?: string }) =>
    post<Student>('/students', data),
  update: (id: string, data: Partial<{ firstName: string; lastName: string; phone: string; status: StudentStatus }>) =>
    patch<Student>(`/students/${id}`, data),
  issueLinkingCode: (id: string) => post<{ code: string }>(`/students/${id}/linking-code`),
}

export const parents = {
  list: () => get<Parent[]>('/parents'),
  create: (data: { fullName: string; phone?: string }) => post<Parent>('/parents', data),
  issueLinkingCode: (id: string) => post<{ code: string }>(`/parents/${id}/linking-code`),
  link: (parentId: string, studentId: string) =>
    post<ParentStudentLink>(`/parents/${parentId}/links`, { studentId }),
  revokeLink: (linkId: string) => patch<ParentStudentLink>(`/parents/links/${linkId}/revoke`),
}

export const groups = {
  list: () => get<Group[]>('/groups'),
  get: (id: string) => get<Group>(`/groups/${id}`),
  create: (data: {
    levelId: string
    teacherId: string
    name: string
    scheduleDays: string[]
    scheduleTime: string
    startDate: string
  }) => post<Group>('/groups', data),
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
  listForGroup: (groupId: string, date?: string) =>
    get<LessonSession[]>(`/groups/${groupId}/sessions${date ? `?date=${date}` : ''}`),
  get: (id: string) => get<LessonSession>(`/sessions/${id}`),
  record: (
    groupId: string,
    data: {
      date: string
      topic?: string
      notes?: string
      materials?: Array<{ type: LessonMaterialType; content: string }>
      homework?: { instructions: string; dueDate?: string }
      attendance?: Array<{ studentId: string; status: AttendanceStatus }>
    },
  ) => post<LessonSession>(`/groups/${groupId}/sessions`, data),
  recordHomeworkResults: (
    sessionId: string,
    results: Array<{ studentId: string; status: HomeworkResultStatus; score?: number | null }>,
  ) => post<unknown>(`/sessions/${sessionId}/homework-results`, { results }),
}

export const assessmentCategories = {
  list: (levelId: string) => get<AssessmentCategory[]>(`/levels/${levelId}/assessment-categories`),
  create: (levelId: string, name: string) =>
    post<AssessmentCategory>(`/levels/${levelId}/assessment-categories`, { name }),
  retire: (id: string) => patch<AssessmentCategory>(`/assessment-categories/${id}/retire`),
}

export const assessments = {
  listForGroup: (groupId: string) => get<Assessment[]>(`/groups/${groupId}/assessments`),
  create: (
    groupId: string,
    data: {
      categoryId: string
      title: string
      type: AssessmentType
      date: string
      maxScore: number
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
