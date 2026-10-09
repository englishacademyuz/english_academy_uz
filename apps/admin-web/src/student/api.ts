import { initData } from './telegram'
import type {
  AttemptState,
  MiniAccounts,
  MiniAttendance,
  MiniChat,
  MiniChatMessage,
  MiniHome,
  MiniHomework,
  MiniHomeworkDetail,
  MiniLessonDetail,
  MiniLessons,
  MiniProfile,
  MiniQuiz,
  MiniSubmission,
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

  /** The account chosen in the app is no longer one this phone may open (e.g. the siblings were untied). */
  get accountUnavailable() {
    return this.statusCode === 403 && this.message === 'ACCOUNT_UNAVAILABLE'
  }
}

/**
 * Whose account is open, on a phone siblings share -- chosen on the first screen each time the
 * app opens, so it lives only in memory: closing the app forgets it.
 */
let chosenStudentId: string | null = null
let onAccountUnavailable: (() => void) | null = null

export function chooseStudent(id: string | null) {
  if (id !== chosenStudentId) {
    // Files fetched for one child mustn't show up for another.
    photoUrls.clear()
    imageUrls.clear()
  }
  chosenStudentId = id
}

/** Called when the server no longer lets this phone open the chosen account -- the app asks again. */
export function whenAccountUnavailable(listener: (() => void) | null) {
  onAccountUnavailable = listener
}

/**
 * Every call carries the raw Telegram init data; the server verifies its
 * signature and decides which students this phone may open. The chosen
 * sibling's id is only a pick among those -- the server checks it.
 */
async function send(path: string, init?: RequestInit): Promise<Response> {
  const body = init?.body
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `tma ${initData()}`,
      ...(chosenStudentId ? { 'x-student-id': chosenStudentId } : {}),
      // A photo goes up as its own bytes; everything else is JSON.
      ...(body instanceof Blob ? { 'content-type': body.type } : body ? { 'content-type': 'application/json' } : {}),
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
    const error = new MiniApiError(message, res.status)
    if (error.accountUnavailable) onAccountUnavailable?.()
    throw error
  }
  return res
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await (await send(path, init)).json()) as T
}

/**
 * Object URLs of homework photos, voice notes and videos already fetched, by path -- an image, audio or video
 * tag can't send the Telegram auth header itself.
 */
const photoUrls = new Map<string, Promise<string>>()

function fileUrl(path: string) {
  let url = photoUrls.get(path)
  if (!url) {
    url = send(path).then(async (res) => URL.createObjectURL(await res.blob()))
    url.catch(() => photoUrls.delete(path))
    photoUrls.set(path, url)
  }
  return url
}
/** The same for the pictures a teacher gives with homework. */
const imageUrls = new Map<string, Promise<string>>()

export const miniApi = {
  accounts: () => request<MiniAccounts>('/student/accounts'),
  chooseAccount: (studentId: string) =>
    request<{ id: string }>(`/student/accounts/${studentId}/choose`, { method: 'POST' }),
  home: () => request<MiniHome>('/student/home'),
  lessons: (page: number) => request<MiniLessons>(`/student/lessons?page=${page}`),
  lesson: (id: string) => request<MiniLessonDetail>(`/student/lessons/${id}`),
  homework: () => request<MiniHomework[]>('/student/homework'),
  homeworkDetail: (lessonId: string) => request<MiniHomeworkDetail>(`/student/homework/${lessonId}`),
  uploadHomeworkPhoto: (lessonId: string, photo: Blob) =>
    request<MiniSubmission>(`/student/homework/${lessonId}/photos`, { method: 'POST', body: photo }),
  deleteHomeworkPhoto: (photoId: string) =>
    request<{ submission: MiniSubmission | null }>(`/student/homework-photos/${photoId}`, { method: 'DELETE' }),
  homeworkPhotoUrl: (photoId: string) => fileUrl(`/student/homework-photos/${photoId}`),
  deleteHomeworkVoice: (voiceId: string) =>
    request<{ submission: MiniSubmission | null }>(`/student/homework-voices/${voiceId}`, { method: 'DELETE' }),
  homeworkVoiceUrl: (voiceId: string) => fileUrl(`/student/homework-voices/${voiceId}`),
  deleteHomeworkVideo: (videoId: string) =>
    request<{ submission: MiniSubmission | null }>(`/student/homework-videos/${videoId}`, { method: 'DELETE' }),
  homeworkVideoUrl: (videoId: string) => fileUrl(`/student/homework-videos/${videoId}`),
  homeworkImageUrl: (imageId: string) => {
    let url = imageUrls.get(imageId)
    if (!url) {
      url = send(`/student/homework-images/${imageId}`).then(async (res) => URL.createObjectURL(await res.blob()))
      url.catch(() => imageUrls.delete(imageId))
      imageUrls.set(imageId, url)
    }
    return url
  },
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
