import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { MiniApiError, miniApi } from '../api'
import { GradeFace } from '../components/art'
import { BigButton, ErrorState, Loading, Screen, Section } from '../components/kit'
import { formatDateTime, gradeOf } from '../format'
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
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm font-extrabold text-tg-muted">
            <span>
              Savol {state.index + 1} / {state.total}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-tg-sand">
            <div className="h-full rounded-full bg-tg-blue transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="rounded-[26px] bg-tg-ink p-5 text-white">
          <p className="whitespace-pre-wrap font-tg-display text-[22px] font-semibold leading-snug">{state.question.text}</p>
        </div>

        <div className="flex flex-col gap-2.5">
          {state.question.options.map((option, i) => (
            <button
              key={option.id}
              disabled={answer.isPending}
              onClick={() => {
                haptic('tap')
                answer.mutate(option.id)
              }}
              className="flex min-h-14 w-full items-center gap-3 rounded-[20px] border-2 border-tg-line bg-white p-3.5 text-left active:scale-[0.99] active:border-tg-blue active:bg-tg-blue-soft disabled:opacity-60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-tg-sun font-tg-display text-lg font-bold">
                {LETTERS[i]}
              </span>
              <span className="text-base font-bold">{option.text}</span>
            </button>
          ))}
        </div>
        {answer.error && <ErrorState error={answer.error} />}
        <p className="text-center text-sm font-bold text-tg-muted">Javobni oʻzgartirib boʻlmaydi — oʻylab tanlang.</p>
      </Screen>
    )
  }

  if (state?.kind === 'completed') return <QuizReview review={state.review} />

  const back = { to: '/student/quizzes', label: 'Testlar' }
  if (quizzes.isLoading) return <Loading />
  if (quizzes.error) {
    return (
      <Screen back={back} title="Test">
        <ErrorState error={quizzes.error} onRetry={() => quizzes.refetch()} />
      </Screen>
    )
  }
  if (!quiz) {
    return (
      <Screen back={back} title="Test">
        <ErrorState error={new MiniApiError('Not found', 404)} />
      </Screen>
    )
  }

  const done = quiz.attempt?.completed
  const closed = !quiz.isOpen && !done
  const startError = start.error instanceof MiniApiError && start.error.statusCode === 409

  return (
    <Screen back={back} eyebrow="🧠 Test" title={quiz.title}>
      <div className="grid grid-cols-3 gap-2">
        <Fact label="Savollar" value={`${quiz.questionCount} ta`} />
        <Fact label="Ball" value={String(quiz.maxPoints)} />
        <Fact label="Muddat" value={quiz.deadline ? formatDateTime(quiz.deadline).slice(0, 5) : 'Yoʻq'} />
      </div>

      {closed || startError ? (
        <div className="flex flex-col items-center gap-2 rounded-[26px] bg-tg-sand px-4 py-6 text-center">
          <p className="text-4xl">⌛</p>
          <p className="font-tg-display text-xl font-semibold">Bu test yopilgan</p>
          <p className="text-[15px] font-bold text-tg-muted">Muddat tugaganidan keyin testni ishlab boʻlmaydi.</p>
        </div>
      ) : (
        <>
          {!done && (
            <div className="rounded-[22px] border-[3px] border-tg-sun bg-tg-sun-soft p-4 text-[15px] font-bold leading-relaxed text-tg-sun-body">
              ⚠️ Testni faqat <b className="font-extrabold">bir marta</b> ishlash mumkin. Har bir javob darhol saqlanadi va uni oʻzgartirib
              boʻlmaydi.
              {quiz.attempt && ' Siz testni boshlagansiz — qolgan savollardan davom etasiz.'}
              {quiz.deadline && ` Muddat: ${formatDateTime(quiz.deadline)} gacha.`}
            </div>
          )}
          <BigButton onClick={() => start.mutate()} disabled={start.isPending} tone={done ? 'blue' : 'green'}>
            {start.isPending ? 'Yuklanmoqda…' : done ? 'Natijani koʻrish' : quiz.attempt ? 'Davom ettirish' : 'Boshlash'}
          </BigButton>
          {start.error && !startError && <ErrorState error={start.error} onRetry={() => start.mutate()} />}
        </>
      )}
    </Screen>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[18px] border-2 border-tg-line bg-white p-3">
      <span className="text-xs font-extrabold uppercase text-tg-muted">{label}</span>
      <span className="font-tg-display text-xl font-semibold">{value}</span>
    </div>
  )
}

function QuizReview({ review }: { review: AttemptReview }) {
  const percentValue = review.total ? Math.round((review.correctCount / review.total) * 100) : 0
  const grade = gradeOf(percentValue)
  return (
    <Screen title="Test yakunlandi! 🎉" subtitle={review.quizTitle}>
      <section className="flex flex-col items-center gap-2 rounded-[30px] bg-tg-grape px-5 py-6 text-center text-white">
        <GradeFace grade={grade} size={72} />
        <p className="font-tg-display text-5xl font-bold tabular-nums">
          {review.correctCount}
          <span className="text-2xl text-tg-grape-soft">/{review.total}</span>
        </p>
        <p className="text-[15px] font-bold text-tg-grape-soft">{percentValue}% toʻgʻri javob</p>
        <p className="mt-1 rounded-full bg-tg-sun px-4 py-1.5 text-[15px] font-extrabold text-tg-ink">
          +{review.points} ball <span className="font-bold opacity-70">/ {review.maxPoints}</span>
        </p>
      </section>

      <Section title="Javoblar">
        <ol className="flex flex-col gap-2.5">
          {review.questions.map((q, i) => (
            <li
              key={i}
              className={`rounded-[20px] p-4 ${q.isCorrect ? 'bg-tg-leaf-soft' : 'bg-tg-cherry-soft'}`}
            >
              <p className="text-[15px] font-extrabold">
                {q.isCorrect ? '✅' : '❌'} {i + 1}. {q.text}
              </p>
              {!q.isCorrect && (
                <div className="mt-1.5 flex flex-col gap-0.5 pl-6 text-sm font-bold">
                  <p className="text-tg-cherry">Sizning javobingiz: {q.chosen ?? 'Javob berilmagan'}</p>
                  <p className="font-extrabold text-tg-leaf-dark">Toʻgʻri javob: {q.correct}</p>
                </div>
              )}
            </li>
          ))}
        </ol>
      </Section>
    </Screen>
  )
}
