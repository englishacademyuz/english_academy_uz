import { initData } from './telegram'
import type {
  AttemptState,
  MiniAttendance,
  MiniChat,
  MiniChatMessage,
  MiniHome,
  MiniHomework,
  MiniLessonDetail,
  MiniLessons,
  MiniProfile,
  MiniQuiz,
  MiniYearMonth,
} from './types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class MiniApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'MiniApiError'
  }

  /** The Telegram account is genuine but not linked to any student yet. */
  get notLinked() {
    return this.statusCode === 403 && this.message === 'NOT_LINKED'
  }
}

/**
 * Every call carries the raw Telegram init data; the server verifies its
 * signature and decides which student this is. No student id is ever sent.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `tma ${initData()}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // no JSON body
    }
    throw new MiniApiError(message, res.status)
  }
  return (await res.json()) as T
}

export const miniApi = {
  home: () => request<MiniHome>('/student/home'),
  lessons: (page: number) => request<MiniLessons>(`/student/lessons?page=${page}`),
  lesson: (id: string) => request<MiniLessonDetail>(`/student/lessons/${id}`),
  homework: () => request<MiniHomework[]>('/student/homework'),
  attendance: (year: number, month: number) => request<MiniAttendance>(`/student/attendance?year=${year}&month=${month}`),
  attendanceYear: () => request<{ months: MiniYearMonth[] }>('/student/attendance/year'),
  profile: () => request<MiniProfile>('/student/profile'),
  quizzes: () => request<MiniQuiz[]>('/student/quizzes'),
  startQuiz: (id: string) => request<AttemptState>(`/student/quizzes/${id}/start`, { method: 'POST' }),
  chat: () => request<MiniChat>('/student/chat'),
  sendChat: (text: string) =>
    request<MiniChatMessage>('/student/chat/messages', { method: 'POST', body: JSON.stringify({ text }) }),
  answer: (attemptId: string, optionId: string) =>
    request<AttemptState>(`/student/quiz-attempts/${attemptId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ optionId }),
    }),
}
