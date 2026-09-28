import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { MaterialPreview } from '../../components/shared/MaterialPreview'
import { miniApi } from '../api'
import { Card, CardTitle, Empty, ErrorState, Loading, Screen } from '../components/kit'
import { formatDate, formatLongDate } from '../format'

export function LessonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const lesson = useQuery({ queryKey: ['mini', 'lesson', id], queryFn: () => miniApi.lesson(id!), enabled: !!id })

  if (lesson.isLoading) return <Loading />
  if (lesson.error || !lesson.data) {
    return (
      <Screen title="Dars">
        <ErrorState error={lesson.error} onRetry={() => lesson.refetch()} />
      </Screen>
    )
  }

  const { topic, date, group, materials, homework } = lesson.data
  return (
    <Screen title={topic || 'Mavzu kiritilmagan'} subtitle={`${formatLongDate(date)} · ${group}`}>
      <Card>
        <CardTitle icon="🎬">Materiallar</CardTitle>
        {materials.length === 0 ? (
          <Empty icon="📂" title="Bu dars uchun material qoʻshilmagan" />
        ) : (
          <ul className="space-y-5">
            {materials.map((m) => (
              <li key={m.id}>
                <MaterialPreview material={m} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon="📝">Uy vazifasi</CardTitle>
        {homework ? (
          <>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
              {homework.instructions}
            </p>
            {homework.dueDate && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Topshirish: {formatDate(homework.dueDate)}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Bu darsda uy vazifasi berilmagan.</p>
        )}
      </Card>
    </Screen>
  )
}
