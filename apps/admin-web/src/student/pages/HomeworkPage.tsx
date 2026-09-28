import { useQuery } from '@tanstack/react-query'
import { miniApi } from '../api'
import { Empty, ErrorState, LinkCard, Loading, Pill, Screen } from '../components/kit'
import { formatDate } from '../format'

/** Vazifa: what to do, per lesson. It's checked in class and graded under Baholar, so no status here. */
export function HomeworkPage() {
  const homework = useQuery({ queryKey: ['mini', 'homework'], queryFn: miniApi.homework })

  if (homework.isLoading) return <Loading />
  if (homework.error || !homework.data) {
    return (
      <Screen title="Uy vazifasi">
        <ErrorState error={homework.error} onRetry={() => homework.refetch()} />
      </Screen>
    )
  }

  const [latest, ...older] = homework.data
  return (
    <Screen title="Uy vazifasi" subtitle="Vazifalar darsda tekshiriladi va Baholar boʻlimida koʻrinadi">
      {!latest ? (
        <Empty icon="🎉" title="Hozircha uy vazifasi berilmagan" />
      ) : (
        <>
          <LinkCard to={`/student/lessons/${latest.lessonId}`} className="ring-2 ring-brand-200 dark:ring-brand-500/30">
            <div className="flex items-center gap-2">
              <Pill tone="brand">Eng soʻnggi</Pill>
              <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(latest.date)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[15px] font-semibold leading-relaxed text-slate-900 dark:text-white">
              {latest.instructions}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {latest.topic ? `Mavzu: ${latest.topic}` : 'Mavzu kiritilmagan'}
              {latest.dueDate && ` · Topshirish: ${formatDate(latest.dueDate)}`}
            </p>
          </LinkCard>

          {older.length > 0 && (
            <>
              <h2 className="px-1 pt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Oldingi vazifalar</h2>
              <div className="space-y-2">
                {older.map((h) => (
                  <LinkCard key={h.lessonId} to={`/student/lessons/${h.lessonId}`}>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(h.date)}
                      {h.topic && ` · ${h.topic}`}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{h.instructions}</p>
                  </LinkCard>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Screen>
  )
}
