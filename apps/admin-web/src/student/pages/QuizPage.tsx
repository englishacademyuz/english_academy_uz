import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { MiniApiError, miniApi } from '../api'
import { Card, CardTitle, ErrorState, InfoRow, Loading, Screen } from '../components/kit'
import { formatDateTime } from '../format'
import { haptic } from '../telegram'
import type { AttemptReview, AttemptState } from '../types'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/**
 * Taking a quiz: an intro (rules + Start), then one question at a time, then
 * the result with every correct answer. The server enforces the single
 * attempt; reopening a finished quiz just shows its result again.
 */
export function QuizPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [state, setState] = useState<AttemptState | null>(null)

  const quizzes = useQuery({ queryKey: ['mini', 'quizzes'], queryFn: miniApi.quizzes })
  const quiz = quizzes.data?.find((q) => q.id === id)

  const refreshAfterFinish = () => {
    queryClient.invalidateQueries({ queryKey: ['mini'] })
  }

  const start = useMutation({
    mutationFn: () => miniApi.startQuiz(id!),
    onSuccess: (next) => {
      setState(next)
      if (next.kind === 'completed') refreshAfterFinish()
    },
  })

  const answer = useMutation({
    mutationFn: (optionId: string) => {
      if (state?.kind !== 'question') throw new Error('No question open')
      return miniApi.answer(state.attemptId, optionId)
    },
    onSuccess: (next) => {
      setState(next)
      if (next.kind === 'completed') {
        haptic('success')
        refreshAfterFinish()
      }
    },
    onError: () => haptic('error'),
  })

  if (state?.kind === 'question') {
    const progress = Math.round((state.index / state.total) * 100)
    return (
      <Screen title={state.quizTitle}>
        <div>
          <div className="flex justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>
              Savol {state.index + 1} / {state.total}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <Card>
          <p className="whitespace-pre-wrap text-lg font-semibold leading-snug text-slate-900 dark:text-white">
            {state.question.text}
          </p>
        </Card>

        <div className="space-y-2">
          {state.question.options.map((option, i) => (
            <button
              key={option.id}
              disabled={answer.isPending}
              onClick={() => {
                haptic('tap')
                answer.mutate(option.id)
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 active:scale-[0.99] active:bg-brand-50 disabled:opacity-60 dark:bg-slate-900 dark:ring-slate-800 dark:active:bg-brand-500/10"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {LETTERS[i]}
              </span>
              <span className="text-[15px] text-slate-900 dark:text-slate-100">{option.text}</span>
            </button>
          ))}
        </div>
        {answer.error && <ErrorState error={answer.error} />}
        <p className="text-center text-xs text-slate-400">Javobni oʻzgartirib boʻlmaydi — oʻylab tanlang.</p>
      </Screen>
    )
  }

  if (state?.kind === 'completed') return <QuizReview review={state.review} />

  if (quizzes.isLoading) return <Loading />
  if (quizzes.error) {
    return (
      <Screen title="Test">
        <ErrorState error={quizzes.error} onRetry={() => quizzes.refetch()} />
      </Screen>
    )
  }
  if (!quiz) {
    return (
      <Screen title="Test">
        <ErrorState error={new MiniApiError('Not found', 404)} />
      </Screen>
    )
  }

  const done = quiz.attempt?.completed
  const closed = !quiz.isOpen && !done
  const startError = start.error instanceof MiniApiError && start.error.statusCode === 409

  return (
    <Screen title={quiz.title} subtitle="🧠 Test">
      <Card>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <InfoRow label="Savollar">{quiz.questionCount} ta</InfoRow>
          <InfoRow label="Maksimal ball">{quiz.maxPoints}</InfoRow>
          {quiz.deadline && <InfoRow label="Muddat">{formatDateTime(quiz.deadline)} gacha</InfoRow>}
        </div>
      </Card>

      {closed || startError ? (
        <Card className="text-center">
          <p className="text-3xl">⌛</p>
          <p className="mt-2 font-medium text-slate-700 dark:text-slate-300">Bu test yopilgan</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Muddat tugaganidan keyin testni ishlab boʻlmaydi.</p>
        </Card>
      ) : (
        <>
          {!done && (
            <div className="rounded-2xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              ⚠️ Testni faqat <b>bir marta</b> ishlash mumkin. Har bir javob darhol saqlanadi va uni oʻzgartirib boʻlmaydi.
              {quiz.attempt && ' Siz testni boshlagansiz — qolgan savollardan davom etasiz.'}
            </div>
          )}
          <button
            onClick={() => start.mutate()}
            disabled={start.isPending}
            className="w-full rounded-2xl bg-brand-600 py-4 text-base font-semibold text-white shadow-md active:scale-[0.99] disabled:opacity-60"
          >
            {start.isPending ? 'Yuklanmoqda…' : done ? 'Natijani koʻrish' : quiz.attempt ? 'Davom ettirish' : '▶️ Boshlash'}
          </button>
          {start.error && !startError && <ErrorState error={start.error} onRetry={() => start.mutate()} />}
        </>
      )}
    </Screen>
  )
}

function QuizReview({ review }: { review: AttemptReview }) {
  const percentValue = review.total ? Math.round((review.correctCount / review.total) * 100) : 0
  return (
    <Screen title="Test yakunlandi! 🎉" subtitle={review.quizTitle}>
      <Card className="py-6 text-center">
        <p className="text-5xl font-extrabold tabular-nums text-slate-900 dark:text-white">
          {review.correctCount}
          <span className="text-2xl text-slate-400">/{review.total}</span>
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{percentValue}% toʻgʻri javob</p>
        <p className="mt-3 inline-block rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          +{review.points} ball <span className="font-normal opacity-70">/ {review.maxPoints}</span>
        </p>
      </Card>

      <Card>
        <CardTitle icon="📋">Javoblar</CardTitle>
        <ol className="space-y-3">
          {review.questions.map((q, i) => (
            <li
              key={i}
              className={`rounded-xl p-3 ${q.isCorrect ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'}`}
            >
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {q.isCorrect ? '✅' : '❌'} {i + 1}. {q.text}
              </p>
              {!q.isCorrect && (
                <div className="mt-1.5 space-y-0.5 pl-6 text-sm">
                  <p className="text-red-700 dark:text-red-300">Sizning javobingiz: {q.chosen ?? 'Javob berilmagan'}</p>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">Toʻgʻri javob: {q.correct}</p>
                </div>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </Screen>
  )
}
