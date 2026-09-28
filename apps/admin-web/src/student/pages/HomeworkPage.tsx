import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { miniApi } from '../api'
import { HomeworkTile } from '../components/art'
import { DayBadge, Empty, ErrorState, Loading, Screen, Section } from '../components/kit'
import { weekdayDate } from '../format'

/** Uyga vazifalar: what to do, per lesson. It's checked in class and graded in Kundalik, so no status here. */
export function HomeworkPage() {
  const homework = useQuery({ queryKey: ['mini', 'homework'], queryFn: miniApi.homework })
  const back = { to: '/student/lessons', label: 'Darslar' }

  if (homework.isLoading) return <Loading />
  if (homework.error || !homework.data) {
    return (
      <Screen back={back} title="Uyga vazifalar">
        <ErrorState error={homework.error} onRetry={() => homework.refetch()} />
      </Screen>
    )
  }

  const [latest, ...older] = homework.data
  return (
    <Screen back={back} title="Uyga vazifalar" subtitle="Ustoz darsda tekshiradi, baho Kundalikda chiqadi">
      {!latest ? (
        <Empty icon={<span className="text-4xl">🎉</span>} title="Hozircha uyga vazifa berilmagan" />
      ) : (
        <>
          <Link
            to={`/student/lessons/${latest.lessonId}`}
            className="flex items-center gap-4 rounded-[28px] border-[3px] border-tg-sun bg-tg-sun-soft p-[18px] active:scale-[0.99]"
          >
            <HomeworkTile size={72} />
            <div className="flex min-w-0 grow flex-col gap-1">
              <span className="text-sm font-extrabold text-tg-sun-ink">ENG SOʻNGGI</span>
              <span className="whitespace-pre-wrap font-tg-display text-xl font-semibold leading-snug">{latest.instructions}</span>
              <span className="text-sm font-bold text-tg-sun-body">
                {latest.dueDate ? `${weekdayDate(new Date(latest.dueDate))} gacha` : latest.topic || weekdayDate(new Date(latest.date))}
              </span>
            </div>
            <ChevronRight className="h-6 w-6 shrink-0" strokeWidth={2.5} />
          </Link>

          {older.length > 0 && (
            <Section title="Oldingi vazifalar">
              <div className="flex flex-col gap-2.5">
                {older.map((h) => (
                  <Link
                    key={h.lessonId}
                    to={`/student/lessons/${h.lessonId}`}
                    className="flex items-center gap-3 rounded-[22px] border-2 border-tg-line bg-white p-3.5 active:scale-[0.99]"
                  >
                    <DayBadge date={new Date(h.date)} />
                    <div className="flex min-w-0 grow flex-col gap-0.5">
                      {h.topic && <span className="truncate text-[13px] font-extrabold uppercase text-tg-muted">{h.topic}</span>}
                      <span className="line-clamp-2 text-[15px] font-bold">{h.instructions}</span>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-tg-faint" strokeWidth={2.5} />
                  </Link>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </Screen>
  )
}
