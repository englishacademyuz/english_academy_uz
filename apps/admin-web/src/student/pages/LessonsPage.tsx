import { useInfiniteQuery } from '@tanstack/react-query'
import { miniApi } from '../api'
import { Card, Empty, ErrorState, InfoRow, LinkCard, Loading, Pill, Screen } from '../components/kit'
import { formatDate, formatSchedule } from '../format'

/** Oʻqish: the student's group and every past lesson (newest first), each opening its sources. */
export function LessonsPage() {
  const lessons = useInfiniteQuery({
    queryKey: ['mini', 'lessons'],
    queryFn: ({ pageParam }) => miniApi.lessons(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
  })

  if (lessons.isLoading) return <Loading />
  if (lessons.error || !lessons.data) {
    return (
      <Screen title="Oʻqish">
        <ErrorState error={lessons.error} onRetry={() => lessons.refetch()} />
      </Screen>
    )
  }

  const group = lessons.data.pages[0].group
  const all = lessons.data.pages.flatMap((p) => p.lessons)

  return (
    <Screen title="Oʻqish" subtitle="Darslar va ularning materiallari">
      {group && (
        <Card>
          <InfoRow label="Guruh">{group.name}</InfoRow>
          <InfoRow label="Oʻqituvchi">{group.teacher}</InfoRow>
          <InfoRow label="Darslar">{formatSchedule(group)}</InfoRow>
        </Card>
      )}

      <h2 className="px-1 pt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">📖 Barcha darslar</h2>
      {all.length === 0 ? (
        <Empty icon="📖" title="Hali darslar yoʻq" hint="Dars oʻtilgach, shu yerda paydo boʻladi." />
      ) : (
        <div className="space-y-2">
          {all.map((lesson) => (
            <LinkCard key={lesson.id} to={`/student/lessons/${lesson.id}`}>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{formatDate(lesson.date)}</p>
              <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{lesson.topic || 'Mavzu kiritilmagan'}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {lesson.materialCount > 0 && <Pill tone="brand">🎬 {lesson.materialCount} ta material</Pill>}
                {lesson.hasHomework && <Pill tone="amber">📝 Uy vazifasi</Pill>}
              </div>
            </LinkCard>
          ))}
          {lessons.hasNextPage && (
            <button
              onClick={() => lessons.fetchNextPage()}
              disabled={lessons.isFetchingNextPage}
              className="w-full rounded-2xl bg-white py-3 text-sm font-medium text-brand-600 ring-1 ring-slate-200 disabled:opacity-60 dark:bg-slate-900 dark:text-brand-400 dark:ring-slate-800"
            >
              {lessons.isFetchingNextPage ? 'Yuklanmoqda…' : 'Yana koʻrsatish'}
            </button>
          )}
        </div>
      )}
    </Screen>
  )
}
