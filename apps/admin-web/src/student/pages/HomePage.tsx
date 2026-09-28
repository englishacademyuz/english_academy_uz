import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { dayKeyOf } from '../../lib/schedule'
import { toDateInputValue } from '../../lib/format'
import { miniApi } from '../api'
import { ClockIcon, GradeFace, HomeworkTile, TrophyIcon } from '../components/art'
import { ErrorState, LinkRow, Loading, Screen, SectionTitle } from '../components/kit'
import { ScheduleChanges, nextLesson, relativeDay } from '../components/schedule'
import { GRADE, MONTHS, averageOf, capitalize, firstName, formatDateTime, gradeOf, initialsOf, weekdayDate } from '../format'
import type { GroupSummary, MiniHome, MiniScheduleChange } from '../types'

export function HomePage() {
  const home = useQuery({ queryKey: ['mini', 'home'], queryFn: miniApi.home })

  if (home.isLoading) return <Loading />
  if (home.error || !home.data) {
    return (
      <Screen title="Bosh sahifa">
        <ErrorState error={home.error} onRetry={() => home.refetch()} />
      </Screen>
    )
  }

  const { student, group, scheduleChanges, lastLesson, latestHomework, openQuizzes, monthProgress, totalPoints } = home.data

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-8 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-bold text-tg-muted">Toshqoʻrgʻon Academy</span>
          <h1 className="truncate font-tg-display text-[32px] font-semibold leading-[1.1]">Salom, {student.firstName}!</h1>
        </div>
        <Link
          to="/student/profile"
          aria-label="Mening profilim"
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-tg-grape-2 font-tg-display text-xl font-semibold text-white"
        >
          {initialsOf(student.firstName, student.lastName)}
        </Link>
      </header>

      <PointsCard total={totalPoints} thisMonth={monthProgress.points} />

      {group && <Countdown group={group} changes={scheduleChanges} lastLesson={lastLesson} />}

      <ScheduleChanges changes={scheduleChanges} />

      {openQuizzes.map((quiz) => (
        <Link
          key={quiz.id}
          to={`/student/quizzes/${quiz.id}`}
          className="flex flex-col gap-3 rounded-[28px] bg-tg-blue-soft p-[18px] active:scale-[0.99]"
        >
          <span className="text-sm font-extrabold uppercase text-tg-blue-dark">🧠 Yangi test</span>
          <span className="font-tg-display text-[22px] font-semibold leading-tight">{quiz.title}</span>
          <span className="text-sm font-bold text-tg-body">
            {quiz.questionCount} ta savol · {quiz.maxPoints} ball
            {quiz.deadline && ` · ${formatDateTime(quiz.deadline)} gacha`}
          </span>
          <span className="rounded-2xl bg-tg-blue p-3.5 text-center text-[17px] font-extrabold text-white">
            {quiz.attempt ? 'Davom ettirish' : 'Boshlash'}
          </span>
        </Link>
      ))}

      {latestHomework && <HomeworkCard homework={latestHomework} />}

      <MonthTiles progress={monthProgress} />
    </div>
  )
}

function PointsCard({ total, thisMonth }: { total: number; thisMonth: number }) {
  return (
    <section className="flex items-center gap-4 rounded-[28px] bg-tg-grape p-5 text-white">
      <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-3xl bg-tg-sun text-tg-ink">
        <TrophyIcon size={44} cupFill="#FFF3BF" />
      </div>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-[15px] font-bold text-tg-grape-soft">Mening ballarim</span>
        <span className="font-tg-display text-5xl font-bold leading-none tabular-nums">{total}</span>
        <span className="mt-1 text-sm font-bold">
          {thisMonth === 0 ? (
            'Bu oy hali ball yoʻq'
          ) : (
            <>
              Bu oy{' '}
              <span className="rounded-full bg-tg-sun px-2 py-0.5 text-tg-ink">
                {thisMonth > 0 ? '+' : ''}
                {thisMonth} ball
              </span>{' '}
              yigʻdim
            </>
          )}
        </span>
      </div>
    </section>
  )
}

/** Ticks once a second -- only the countdown needs it. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Two big tiles, in the largest units that fit: days·hours, hours·minutes, or minutes·seconds. */
function countdownParts(ms: number): Array<[string, string]> {
  const s = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  if (days > 0) return [[String(days), 'kun'], [pad(hours), 'soat']]
  if (hours > 0) return [[pad(hours), 'soat'], [pad(minutes), 'daqiqa']]
  return [[pad(minutes), 'daqiqa'], [pad(s % 60), 'soniya']]
}

function Countdown({
  group,
  changes,
  lastLesson,
}: {
  group: GroupSummary
  changes: MiniScheduleChange[]
  lastLesson: MiniHome['lastLesson']
}) {
  const now = useNow()
  const next = nextLesson(group, changes, now)
  if (!next) return null

  const started = next.start <= now
  const parts = countdownParts(next.start.getTime() - now.getTime())
  // The teacher opens the day's lesson (and its topic) around lesson time.
  const topic = lastLesson && dayKeyOf(lastLesson.date) === toDateInputValue(next.start) ? lastLesson.topic : null

  return (
    <section className="flex flex-col gap-3.5 rounded-[28px] bg-tg-ink px-5 py-[22px] text-white">
      <div className="flex items-center gap-2 text-tg-sun">
        <ClockIcon size={22} />
        <span className="text-base font-extrabold">{started ? 'Dars boshlandi!' : 'Dars boshlanishiga'}</span>
        {next.moved && (
          <span className="ml-auto rounded-full bg-tg-orange px-2.5 py-0.5 text-xs font-extrabold text-white">Vaqti oʻzgardi</span>
        )}
      </div>

      {!started && (
        <div className="flex items-end gap-1.5 font-tg-display leading-none" aria-live="off">
          {parts.map(([value, unit], i) => (
            <div key={unit} className="contents">
              {i === 1 && <span className="pb-[34px] text-[64px] font-bold text-tg-sun">:</span>}
              <div className="flex flex-col items-center gap-1.5">
                <span className="min-w-24 rounded-[18px] bg-tg-ink-2 px-3.5 py-2 text-center text-[76px] font-bold text-tg-sun tabular-nums">
                  {value}
                </span>
                <span className="font-tg-body text-[13px] font-bold text-tg-mist">{unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <InfoTile label={relativeDay(next.start, now)} value={next.time} big />
        <InfoTile label="Ustoz" value={firstName(group.teacher)} />
        <InfoTile label="Guruh" value={group.name} />
      </div>
      {topic && <span className="text-[15px] font-bold">Mavzu: {topic}</span>}
    </section>
  )
}

function InfoTile({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-tg-ink-2 p-2.5">
      <span className="truncate text-xs font-bold text-tg-mist">{label}</span>
      <span className={`truncate font-extrabold ${big ? 'text-[17px]' : 'text-[15px]'}`}>{value}</span>
    </div>
  )
}

function HomeworkCard({ homework }: { homework: NonNullable<MiniHome['latestHomework']> }) {
  const due = homework.dueDate ? `${weekdayDate(new Date(homework.dueDate))} gacha` : `${weekdayDate(new Date(homework.date))} darsidan`
  return (
    <Link
      to={`/student/lessons/${homework.lessonId}`}
      className="flex items-center gap-4 rounded-[28px] border-[3px] border-tg-sun bg-tg-sun-soft p-[18px] active:scale-[0.99]"
    >
      <HomeworkTile />
      <div className="flex min-w-0 grow flex-col gap-1">
        <span className="text-sm font-extrabold text-tg-sun-ink">UYGA VAZIFA</span>
        <span className="line-clamp-3 font-tg-display text-[22px] font-semibold leading-[1.15]">{homework.instructions}</span>
        <span className="text-sm font-bold text-tg-sun-body">{due}</span>
      </div>
      <ChevronRight className="h-6 w-6 shrink-0" strokeWidth={2.5} />
    </Link>
  )
}

function MonthTiles({ progress }: { progress: MiniHome['monthProgress'] }) {
  const month = MONTHS[new Date().getMonth()]
  const tiles = [
    { label: 'Darsga kelish', percent: progress.attendanceRate },
    { label: 'Baholar', percent: averageOf(Object.values(progress.academicByCategory)) },
    { label: 'Testlar', percent: progress.quizAverage },
  ]
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{capitalize(month)}da qanday oʻqidim?</SectionTitle>
      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map(({ label, percent }) => {
          const grade = gradeOf(percent)
          const look = grade ? GRADE[grade] : null
          return (
            <div
              key={label}
              className="flex flex-col items-center gap-1.5 rounded-[22px] px-2 py-3.5 text-center"
              style={{ backgroundColor: look?.light ?? '#F3ECDF' }}
            >
              <GradeFace grade={grade} />
              <span className="font-tg-display text-xl font-semibold leading-tight" style={{ color: look?.dark ?? '#5C6680' }}>
                {look?.word ?? 'Hali yoʻq'}
              </span>
              <span className="text-[13px] font-bold text-tg-body">{label}</span>
            </div>
          )
        })}
      </div>
      <LinkRow to="/student/diary">Kundalikni ochish</LinkRow>
    </section>
  )
}
