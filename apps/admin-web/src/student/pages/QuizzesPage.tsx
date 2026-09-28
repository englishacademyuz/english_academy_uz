import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { miniApi } from '../api'
import { DayBadge, Empty, ErrorState, Loading, Screen, Section } from '../components/kit'
import { formatDateTime } from '../format'
import type { MiniQuiz } from '../types'

function QuizStatus({ quiz }: { quiz: MiniQuiz }) {
  const pill = 'rounded-full px-2.5 py-0.5 text-[13px] font-extrabold'
  if (quiz.attempt?.completed) {
    return (
      <span className={`${pill} bg-tg-leaf-soft text-tg-leaf-dark`}>
        {quiz.attempt.correctCount}/{quiz.questionCount} · +{quiz.attempt.points} ball
      </span>
    )
  }
  if (quiz.isOpen) return <span className={`${pill} bg-tg-blue-soft text-tg-blue-dark`}>{quiz.attempt ? 'Davom ettiring' : 'Ochiq'}</span>
  return <span className={`${pill} bg-tg-sand text-tg-muted`}>Oʻtkazib yuborilgan</span>
}

export function QuizzesPage() {
  const quizzes = useQuery({ queryKey: ['mini', 'quizzes'], queryFn: miniApi.quizzes })
  const back = { to: '/student/diary', label: 'Kundalik' }

  if (quizzes.isLoading) return <Loading />
  if (quizzes.error || !quizzes.data) {
    return (
      <Screen back={back} title="Testlar">
        <ErrorState error={quizzes.error} onRetry={() => quizzes.refetch()} />
      </Screen>
    )
  }

  const open = quizzes.data.filter((q) => q.isOpen && !q.attempt?.completed)
  const past = quizzes.data.filter((q) => !(q.isOpen && !q.attempt?.completed))

  return (
    <Screen back={back} title="Testlar" subtitle="Har bir testni faqat bir marta ishlash mumkin">
      <Section title="Ochiq testlar">
        {open.length === 0 ? (
          <Empty icon={<span className="text-4xl">🧠</span>} title="Hozircha ochiq test yoʻq" hint="Yangi test yuborilganda bot xabar beradi." />
        ) : (
          open.map((quiz) => (
            <Link
              key={quiz.id}
              to={`/student/quizzes/${quiz.id}`}
              className="flex flex-col gap-2 rounded-[28px] bg-tg-blue-soft p-[18px] active:scale-[0.99]"
            >
              <span className="font-tg-display text-[22px] font-semibold leading-tight">{quiz.title}</span>
              <span className="text-sm font-bold text-tg-body">
                {quiz.questionCount} ta savol · {quiz.maxPoints} ball
                {quiz.deadline && ` · ${formatDateTime(quiz.deadline)} gacha`}
              </span>
              <span className="mt-1 rounded-2xl bg-tg-blue p-3.5 text-center text-[17px] font-extrabold text-white">
                {quiz.attempt ? 'Davom ettirish' : 'Boshlash'}
              </span>
            </Link>
          ))
        )}
      </Section>

      {past.length > 0 && (
        <Section title="Oldingi testlar">
          {past.map((quiz) => (
            <Link
              key={quiz.id}
              to={`/student/quizzes/${quiz.id}`}
              className="flex items-center gap-3 rounded-[22px] border-2 border-tg-line bg-white p-3.5 active:scale-[0.99]"
            >
              <DayBadge date={new Date(quiz.date)} />
              <div className="flex min-w-0 grow flex-col items-start gap-1.5">
                <span className="truncate text-base font-extrabold">{quiz.title}</span>
                <QuizStatus quiz={quiz} />
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-tg-faint" strokeWidth={2.5} />
            </Link>
          ))}
        </Section>
      )}
    </Screen>
  )
}
