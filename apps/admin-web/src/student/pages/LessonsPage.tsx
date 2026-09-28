import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { miniApi } from '../api'
import { BookIcon, HomeIcon, PlayIcon } from '../components/art'
import { Card, DayBadge, Empty, ErrorState, LinkRow, Loading, Screen, Section } from '../components/kit'
import { ScheduleChanges, WeekStrip, addDays, nextLesson, sameDay } from '../components/schedule'
import { firstName, weekdayDate, weekdayDayMonth } from '../format'
import type { MiniLessons } from '../types'

type Lesson = MiniLessons['lessons'][number]

/** Darslar: this week's lesson days, today's (or the latest) lesson up front, the next one, then every past lesson. */
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
      <Screen title="Darslar">
        <ErrorState error={lessons.error} onRetry={() => lessons.refetch()} />
      </Screen>
    )
  }

  const { group, scheduleChanges } = lessons.data.pages[0]
  const [latest, ...past] = lessons.data.pages.flatMap((p) => p.lessons)
  const now = new Date()
  const latestIsToday = !!latest && sameDay(new Date(latest.date), now)
  const upcoming = group ? nextLesson(group, scheduleChanges, now, addDays(now, 1)) : null

  return (
    <Screen title="Darslar" subtitle={group ? `${firstName(group.teacher)} ustoz · ${group.name}` : undefined}>
      {group ? (
        <Card className="flex flex-col gap-3">
          <span className="text-[15px] font-extrabold">Dars kunlarim · soat {group.scheduleTime}</span>
          <WeekStrip group={group} changes={scheduleChanges} />
        </Card>
      ) : (
        <Empty title="Hozircha faol guruhga yozilmagansiz" hint="Administrator bilan bogʻlaning." />
      )}

      <ScheduleChanges changes={scheduleChanges} />

      {latest && (
        <Section title={latestIsToday ? 'Bugungi dars' : 'Oxirgi dars'}>
          <FeaturedLesson lesson={latest} time={latestIsToday ? group?.scheduleTime : undefined} />
        </Section>
      )}

      {upcoming && (
        <Section title="Keyingi dars">
          <div className="flex items-center gap-3.5 rounded-[22px] border-2 border-dashed border-tg-dash bg-white p-4">
            <DayBadge date={upcoming.start} size="lg" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[17px] font-extrabold">
                {weekdayDate(upcoming.start)}, {upcoming.time}
              </span>
              <span className="text-sm font-bold text-tg-muted">
                {upcoming.moved ? 'Dars vaqti oʻzgargan' : 'Mavzuni ustoz tez orada qoʻshadi'}
              </span>
            </div>
          </div>
        </Section>
      )}

      <Section title="Oʻtgan darslar">
        {past.length === 0 ? (
          <Empty icon={<BookIcon size={48} strokeWidth={1.8} />} title="Oʻtgan darslar shu yerda yigʻiladi" />
        ) : (
          <div className="flex flex-col gap-2.5">
            {past.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} />
            ))}
            {lessons.hasNextPage && (
              <button
                onClick={() => lessons.fetchNextPage()}
                disabled={lessons.isFetchingNextPage}
                className="min-h-12 rounded-[18px] border-2 border-tg-line bg-white text-base font-extrabold text-tg-blue-dark disabled:opacity-60"
              >
                {lessons.isFetchingNextPage ? 'Yuklanmoqda…' : 'Yana koʻrsatish'}
              </button>
            )}
          </div>
        )}
      </Section>

      {group && <LinkRow to="/student/homework">Barcha uy vazifalari</LinkRow>}
    </Screen>
  )
}

function FeaturedLesson({ lesson, time }: { lesson: Lesson; time?: string }) {
  return (
    <Link to={`/student/lessons/${lesson.id}`} className="flex flex-col gap-3.5 rounded-[28px] bg-tg-blue-soft p-[18px] active:scale-[0.99]">
      <div className="flex items-center gap-3.5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-tg-blue text-white">
          <BookIcon size={34} strokeWidth={2} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-extrabold uppercase text-tg-blue-dark">
            {weekdayDayMonth(new Date(lesson.date))}
            {time && ` · ${time}`}
          </span>
          <span className="font-tg-display text-[26px] font-semibold leading-tight">{lesson.topic || 'Mavzu kiritilmagan'}</span>
        </div>
      </div>
      <LessonPills lesson={lesson} />
      <span className="rounded-2xl bg-tg-blue p-3.5 text-center text-[17px] font-extrabold text-white">Darsni ochish</span>
    </Link>
  )
}

function LessonPills({ lesson }: { lesson: Lesson }) {
  if (lesson.materialCount === 0 && !lesson.hasHomework) return null
  return (
    <div className="flex flex-wrap gap-2">
      {lesson.materialCount > 0 && (
        <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm font-extrabold">
          <PlayIcon size={18} className="text-tg-blue" />
          {lesson.materialCount} ta material
        </span>
      )}
      {lesson.hasHomework && (
        <span className="flex items-center gap-1.5 rounded-full bg-tg-sun px-3 py-2 text-sm font-extrabold">
          <HomeIcon size={18} />
          Uyga vazifa bor
        </span>
      )}
    </div>
  )
}

function LessonRow({ lesson }: { lesson: Lesson }) {
  return (
    <Link
      to={`/student/lessons/${lesson.id}`}
      className="flex items-center gap-3 rounded-[22px] border-2 border-tg-line bg-white p-3.5 active:scale-[0.99]"
    >
      <DayBadge date={new Date(lesson.date)} />
      <div className="flex min-w-0 grow flex-col gap-1.5">
        <span className="truncate text-base font-extrabold">{lesson.topic || 'Mavzu kiritilmagan'}</span>
        <div className="flex flex-wrap gap-1.5 text-[13px] font-extrabold">
          {lesson.materialCount > 0 && <span className="rounded-full bg-tg-blue-soft px-2.5 py-0.5 text-tg-blue-dark">{lesson.materialCount} ta material</span>}
          {lesson.hasHomework && <span className="rounded-full bg-tg-sun-soft px-2.5 py-0.5 text-tg-sun-ink">Uyga vazifa</span>}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-tg-faint" strokeWidth={2.5} />
    </Link>
  )
}
