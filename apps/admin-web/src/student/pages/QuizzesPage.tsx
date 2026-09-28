import { useQuery } from '@tanstack/react-query'
import { miniApi } from '../api'
import { Empty, ErrorState, LinkCard, Loading, Pill, Screen } from '../components/kit'
import { formatDate, formatDateTime } from '../format'
import type { MiniQuiz } from '../types'

function QuizStatus({ quiz }: { quiz: MiniQuiz }) {
  if (quiz.attempt?.completed) {
    return (
      <Pill tone="green">
        {quiz.attempt.correctCount}/{quiz.questionCount} · +{quiz.attempt.points} ball
      </Pill>
    )
  }
  if (quiz.isOpen) return <Pill tone="brand">{quiz.attempt ? 'Davom ettiring' : 'Ochiq'}</Pill>
  return <Pill>Oʻtkazib yuborilgan</Pill>
}

export function QuizzesPage() {
  const quizzes = useQuery({ queryKey: ['mini', 'quizzes'], queryFn: miniApi.quizzes })

  if (quizzes.isLoading) return <Loading />
  if (quizzes.error || !quizzes.data) {
    return (
      <Screen title="Testlar">
        <ErrorState error={quizzes.error} onRetry={() => quizzes.refetch()} />
      </Screen>
    )
  }

  const open = quizzes.data.filter((q) => q.isOpen && !q.attempt?.completed)
  const past = quizzes.data.filter((q) => !(q.isOpen && !q.attempt?.completed))

  return (
    <Screen title="Testlar" subtitle="Har bir testni faqat bir marta ishlash mumkin">
      <h2 className="px-1 text-sm font-semibold text-slate-500 dark:text-slate-400">🟢 Ochiq testlar</h2>
      {open.length === 0 ? (
        <Empty icon="🧠" title="Hozircha ochiq test yoʻq" hint="Yangi test yuborilganda bot xabar beradi." />
      ) : (
        <div className="space-y-2">
          {open.map((quiz) => (
            <LinkCard key={quiz.id} to={`/student/quizzes/${quiz.id}`} className="ring-2 ring-brand-200 dark:ring-brand-500/30">
              <p className="font-semibold text-slate-900 dark:text-white">{quiz.title}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {quiz.questionCount} ta savol · {quiz.maxPoints} ball
                {quiz.deadline && ` · ${formatDateTime(quiz.deadline)} gacha`}
              </p>
              <div className="mt-1.5">
                <QuizStatus quiz={quiz} />
              </div>
            </LinkCard>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="px-1 pt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Oldingi testlar</h2>
          <div className="space-y-2">
            {past.map((quiz) => (
              <LinkCard key={quiz.id} to={`/student/quizzes/${quiz.id}`}>
                <p className="font-medium text-slate-900 dark:text-white">{quiz.title}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{formatDate(quiz.date)}</p>
                <div className="mt-1.5">
                  <QuizStatus quiz={quiz} />
                </div>
              </LinkCard>
            ))}
          </div>
        </>
      )}
    </Screen>
  )
}
