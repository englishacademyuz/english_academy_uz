import { useState, type ReactNode } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dayKeyOf } from '../../lib/schedule'
import { toDateInputValue } from '../../lib/format'
import { miniApi } from '../api'
import { GradeFace } from '../components/art'
import { DayBadge, Empty, ErrorState, LinkRow, Loading, Screen } from '../components/kit'
import { addDays, lessonOn, weekStart } from '../components/schedule'
import {
  ATTENDANCE,
  GRADE,
  MONTHS,
  WEEKDAYS,
  WEEK_SHORT,
  averageOf,
  capitalize,
  formatWeekRange,
  gradeOf,
  percentOf,
  type Grade,
} from '../format'
import type { MiniAttendance, MiniMark, MiniYearMonth } from '../types'

type Tab = 'week' | 'month' | 'year'
const TABS: Array<[Tab, string]> = [
  ['week', 'Hafta'],
  ['month', 'Oy'],
  ['year', 'Butun yil'],
]

type Day = MiniAttendance['days'][number]

const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const attendanceQuery = (month: Date) => ({
  queryKey: ['mini', 'attendance', month.getFullYear(), month.getMonth() + 1],
  queryFn: () => miniApi.attendance(month.getFullYear(), month.getMonth() + 1),
})

/** A day's grade: the average of all its marks, as a 5-point grade. */
function gradeOfMarks(marks: MiniMark[]): Grade | null {
  return gradeOf(averageOf(marks.map((m) => percentOf(m.score, m.maxScore)).filter((p): p is number => p !== null)))
}

function groupByDay<T>(items: T[], dateOf: (t: T) => string) {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = dayKeyOf(dateOf(item))
    map.set(key, [...(map.get(key) ?? []), item])
  }
  return map
}

/** Kundalik: marks and attendance together, by week, month, or the whole academic year. */
export function DiaryPage() {
  const [tab, setTab] = useState<Tab>('month')
  const [month, setMonth] = useState(() => firstOfMonth(new Date()))

  return (
    <Screen title="Kundalik" subtitle="Baholar va darsga kelish">
      <div className="grid grid-cols-3 gap-1 rounded-[18px] bg-tg-sand p-[5px]" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-11 rounded-[14px] text-base font-extrabold ${
              tab === key ? 'bg-white text-tg-ink shadow-[0_2px_0_#E2D6C0]' : 'text-tg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([5, 4, 3, 2] as Grade[]).map((g) => (
          <span
            key={g}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[13px] font-extrabold"
            style={{ backgroundColor: GRADE[g].light, color: GRADE[g].dark }}
          >
            <span className="font-tg-display text-[15px]">{g}</span>
            {GRADE[g].word}
          </span>
        ))}
      </div>

      {tab === 'week' && <WeekView />}
      {tab === 'month' && <MonthView month={month} onMonth={setMonth} />}
      {tab === 'year' && (
        <YearView
          onPick={(m) => {
            setMonth(m)
            setTab('month')
          }}
        />
      )}

      <LinkRow to="/student/quizzes">Testlar</LinkRow>
    </Screen>
  )
}

function MonthView({ month, onMonth }: { month: Date; onMonth: (m: Date) => void }) {
  const attendance = useQuery(attendanceQuery(month))
  const home = useQuery({ queryKey: ['mini', 'home'], queryFn: miniApi.home })
  const [picked, setPicked] = useState<string | null>(null)
  const isCurrent = toDateInputValue(month) === toDateInputValue(firstOfMonth(new Date()))
  const monthName = MONTHS[month.getMonth()]

  const nav = (
    <div className="flex items-center justify-between">
      <MonthButton label="Oldingi oy" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
        <ChevronLeft className="h-5 w-5" strokeWidth={2.6} />
      </MonthButton>
      <span className="font-tg-display text-xl font-semibold">
        {capitalize(monthName)} {month.getFullYear()}
      </span>
      <MonthButton label="Keyingi oy" disabled={isCurrent} onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
        <ChevronRight className="h-5 w-5" strokeWidth={2.6} />
      </MonthButton>
    </div>
  )

  if (attendance.isLoading) return <Loading />
  if (attendance.error || !attendance.data) return <ErrorState error={attendance.error} onRetry={() => attendance.refetch()} />

  const { days, marks, totals } = attendance.data
  const lessonsByDay = groupByDay(days, (d) => d.date)
  const marksByDay = groupByDay(marks, (m) => m.date)
  const counted = totals.PRESENT + totals.LATE + totals.ABSENT
  const attended = totals.PRESENT + totals.LATE
  const monthGrade = gradeOfMarks(marks)

  // Default to the most recent day that has something to show.
  const selected = picked && (lessonsByDay.has(picked) || marksByDay.has(picked)) ? picked : ([...lessonsByDay.keys(), ...marksByDay.keys()].sort().at(-1) ?? null)

  const group = home.data?.group
  const changes = home.data?.scheduleChanges ?? []
  const todayKey = toDateInputValue(new Date())
  const lead = (month.getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()

  return (
    <section className="flex flex-col gap-3.5">
      <div
        className="flex items-center gap-3.5 rounded-3xl p-4"
        style={{ backgroundColor: monthGrade ? GRADE[monthGrade].light : '#F3ECDF' }}
      >
        <GradeFace grade={monthGrade} size={60} />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-extrabold uppercase" style={{ color: monthGrade ? GRADE[monthGrade].dark : '#5C6680' }}>
            {monthName} natijasi
          </span>
          <span className="font-tg-display text-[28px] font-semibold leading-[1.1]">{monthGrade ? GRADE[monthGrade].word : 'Hali baho yoʻq'}</span>
          <span className="text-sm font-bold text-tg-body">
            {counted ? `${counted} darsdan ${attended} tasiga keldi` : 'Bu oyda davomat belgilanmagan'}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 rounded-3xl border-2 border-tg-line bg-white p-3.5">
        {nav}
        <div className="grid grid-cols-7 gap-[5px] text-center text-xs font-extrabold text-tg-muted">
          {WEEK_SHORT.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-[5px]">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const date = new Date(month.getFullYear(), month.getMonth(), i + 1)
            const key = toDateInputValue(date)
            const lesson = lessonsByDay.get(key)?.[0]
            const dayMarks = marksByDay.get(key) ?? []
            if (!lesson && dayMarks.length === 0) {
              const upcoming = key > todayKey && group && lessonOn(group, changes, date)
              return (
                <div
                  key={key}
                  className={`flex h-[50px] items-center justify-center rounded-xl text-[13px] font-bold text-tg-faint ${
                    upcoming ? 'border-2 border-dashed border-tg-dash' : ''
                  }`}
                >
                  {i + 1}
                </div>
              )
            }
            return (
              <DayCell
                key={key}
                day={i + 1}
                label={`${i + 1} ${monthName}`}
                lesson={lesson}
                marks={dayMarks}
                selected={key === selected}
                onPick={() => setPicked(key)}
              />
            )
          })}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 pt-1 text-xs font-bold text-tg-body">
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-[5px] bg-white shadow-[inset_0_0_0_2px_#EFE4D2]" />✓ Keldi
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-[5px] shadow-[inset_0_0_0_3px_#F08C00]" />
            Kechikdi
          </span>
          <span className="flex items-center gap-1.5">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[5px] bg-[#F1F3F5] text-[10px] text-tg-cherry">✕</span>
            Kelmadi
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-[5px] border-2 border-dashed border-tg-dash" />
            Dars boʻladi
          </span>
        </div>
      </div>

      {selected ? (
        <DayDetail
          date={selected}
          monthName={monthName}
          lesson={lessonsByDay.get(selected)?.[0]}
          marks={marksByDay.get(selected) ?? []}
        />
      ) : (
        <Empty title="Bu oyda hali dars boʻlmagan" />
      )}
    </section>
  )
}

function MonthButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-tg-sand text-tg-ink disabled:opacity-30"
    >
      {children}
    </button>
  )
}

/** One lesson day on the calendar: its grade (colored), or its attendance when there's no mark. */
function DayCell({
  day,
  label,
  lesson,
  marks,
  selected,
  onPick,
}: {
  day: number
  label: string
  lesson?: Day
  marks: MiniMark[]
  selected: boolean
  onPick: () => void
}) {
  const grade = gradeOfMarks(marks)
  const status = lesson?.status ?? null
  let bg = '#F3ECDF'
  let fg = '#5C6680'
  let mark: string = '·'
  if (status === 'ABSENT') {
    bg = '#F1F3F5'
    fg = '#B42318'
    mark = '✕'
  } else if (grade) {
    bg = GRADE[grade].light
    fg = GRADE[grade].dark
    mark = String(grade)
  } else if (status === 'PRESENT' || status === 'LATE') {
    bg = '#FFFFFF'
    fg = '#1B6B2C'
    mark = '✓'
  } else if (status === 'EXCUSED') {
    bg = '#E6ECFF'
    fg = '#2F4AC0'
    mark = '–'
  }
  const rings = [status === 'LATE' ? 'inset 0 0 0 3px #F08C00' : bg === '#FFFFFF' ? 'inset 0 0 0 2px #EFE4D2' : null].filter(Boolean)

  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={label}
      aria-pressed={selected}
      className={`flex h-[50px] w-full flex-col items-center justify-center gap-0.5 rounded-xl ${
        selected ? 'outline-[3px] outline-offset-1 outline-tg-ink outline-solid' : ''
      }`}
      style={{ backgroundColor: bg, color: fg, boxShadow: rings.join(', ') || undefined }}
    >
      <span className="text-[10px] font-extrabold opacity-80">{day}</span>
      <span className="font-tg-display text-[19px] font-bold leading-none">{mark}</span>
    </button>
  )
}

function DayDetail({ date, monthName, lesson, marks }: { date: string; monthName: string; lesson?: Day; marks: MiniMark[] }) {
  const day = Number(date.slice(8, 10))
  const status = lesson?.status ? ATTENDANCE[lesson.status] : null
  return (
    <div className="flex flex-col gap-3 rounded-3xl border-2 border-tg-line bg-white p-4">
      <span className="font-tg-display text-xl font-semibold">
        {day} {monthName}
        {lesson?.topic && ` · ${lesson.topic}`}
      </span>
      {lesson && (
        <div
          className="rounded-[14px] px-3 py-2.5 text-[15px] font-extrabold"
          style={status ? { backgroundColor: status.bg, color: status.fg } : { backgroundColor: '#F3ECDF', color: '#5C6680' }}
        >
          {status ? status.sentence : 'Davomat hali belgilanmagan'}
        </div>
      )}
      {marks.length === 0 ? (
        <span className="text-sm font-bold text-tg-muted">Bu kuni baho qoʻyilmagan</span>
      ) : (
        marks.map((m) => <MarkRow key={m.id} mark={m} />)
      )}
      {lesson && (
        <Link to={`/student/lessons/${lesson.lessonId}`} className="flex items-center justify-between rounded-2xl bg-tg-sand px-4 py-3 text-[15px] font-extrabold text-tg-blue-dark">
          Darsni ochish
          <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
        </Link>
      )}
    </div>
  )
}

function MarkRow({ mark }: { mark: MiniMark }) {
  const grade = gradeOf(percentOf(mark.score, mark.maxScore))
  const look = grade ? GRADE[grade] : null
  const what =
    mark.kind === 'quiz'
      ? `Test: ${mark.title} · ${mark.maxScore} tadan ${mark.score} toʻgʻri`
      : `${mark.title}${mark.category !== mark.title ? ` · ${mark.category}` : ''} · ${mark.score}/${mark.maxScore}`
  return (
    <div className="flex items-center gap-3">
      <GradeFace grade={grade} size={44} />
      <div className="flex min-w-0 grow flex-col">
        <span className="text-base font-extrabold">{look?.word ?? 'Baholanmagan'}</span>
        <span className="text-[13px] font-bold text-tg-muted">{what}</span>
      </div>
      {grade && (
        <span
          className="flex h-11 min-w-11 items-center justify-center rounded-[14px] font-tg-display text-[22px] font-bold"
          style={{ backgroundColor: look!.light, color: look!.dark }}
        >
          {grade}
        </span>
      )}
    </div>
  )
}

/** This week, Monday to Sunday: lessons that happened (with attendance and grade) and those still to come. */
function WeekView() {
  const home = useQuery({ queryKey: ['mini', 'home'], queryFn: miniApi.home })
  const monday = weekStart(new Date())
  const sunday = addDays(monday, 6)
  const months = [...new Map([monday, sunday].map((d) => [toDateInputValue(firstOfMonth(d)), firstOfMonth(d)])).values()]
  const results = useQueries({ queries: months.map(attendanceQuery) })

  if (results.some((r) => r.isLoading)) return <Loading />
  const failed = results.find((r) => r.error)
  if (failed) return <ErrorState error={failed.error} onRetry={() => results.forEach((r) => r.refetch())} />

  const lessonsByDay = groupByDay(results.flatMap((r) => r.data?.days ?? []), (d) => d.date)
  const marksByDay = groupByDay(results.flatMap((r) => r.data?.marks ?? []), (m) => m.date)
  const group = home.data?.group
  const changes = home.data?.scheduleChanges ?? []

  const rows = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).flatMap((date) => {
    const key = toDateInputValue(date)
    const lesson = lessonsByDay.get(key)?.[0]
    const scheduled = group ? lessonOn(group, changes, date) : null
    if (!lesson && !scheduled) return []
    return [{ date, lesson, scheduled, marks: marksByDay.get(key) ?? [] }]
  })

  return (
    <section className="flex flex-col gap-2.5">
      <span className="text-base font-extrabold">{formatWeekRange(monday)}</span>
      {rows.length === 0 ? (
        <Empty title="Bu hafta dars yoʻq" />
      ) : (
        rows.map(({ date, lesson, scheduled, marks }) => {
          const grade = gradeOfMarks(marks)
          const status = lesson?.status ? ATTENDANCE[lesson.status] : null
          const body = (
            <>
              <DayBadge date={date} />
              <div className="flex min-w-0 grow flex-col gap-0.5">
                <span className="truncate text-base font-extrabold">
                  {lesson?.topic || `${WEEKDAYS[date.getDay()]}, ${scheduled?.time ?? ''}`}
                </span>
                <span className="text-sm font-extrabold" style={{ color: status?.fg ?? '#5C6680' }}>
                  {status ? status.short : lesson ? 'Davomat belgilanmagan' : 'Hali boʻlmagan'}
                </span>
              </div>
              {grade && (
                <span
                  className="flex h-12 min-w-12 items-center justify-center rounded-[14px] font-tg-display text-2xl font-bold"
                  style={{ backgroundColor: GRADE[grade].light, color: GRADE[grade].dark }}
                >
                  {grade}
                </span>
              )}
            </>
          )
          const className = 'flex items-center gap-3 rounded-[22px] border-2 border-tg-line bg-white p-3.5'
          return lesson ? (
            <Link key={date.getTime()} to={`/student/lessons/${lesson.lessonId}`} className={`${className} active:scale-[0.99]`}>
              {body}
            </Link>
          ) : (
            <div key={date.getTime()} className={className}>
              {body}
            </div>
          )
        })
      )}
    </section>
  )
}

/** The academic year, one row per month (newest first) -- tapping a month opens it. */
function YearView({ onPick }: { onPick: (month: Date) => void }) {
  const year = useQuery({ queryKey: ['mini', 'attendance-year'], queryFn: miniApi.attendanceYear })

  if (year.isLoading) return <Loading />
  if (year.error || !year.data) return <ErrorState error={year.error} onRetry={() => year.refetch()} />

  return (
    <section className="flex flex-col gap-2.5">
      <span className="text-[15px] font-bold text-tg-muted">Har oy bitta qator — bosib, oʻsha oyni oching</span>
      {year.data.months.map((m: MiniYearMonth) => {
        const grade = gradeOf(m.markAverage)
        return (
          <button
            key={`${m.year}-${m.month}`}
            type="button"
            onClick={() => onPick(new Date(m.year, m.month - 1, 1))}
            className="flex min-h-16 w-full items-center gap-3 rounded-[20px] border-2 border-tg-line bg-white px-3.5 py-2.5 text-left active:scale-[0.99]"
          >
            <GradeFace grade={grade} size={40} />
            <span className="flex grow flex-col gap-0.5">
              <span className="text-base font-extrabold">{capitalize(MONTHS[m.month - 1])}</span>
              <span className="text-[13px] font-bold text-tg-muted">
                {m.lessons ? `${m.lessons} darsdan ${m.attended} tasiga keldi` : 'Davomat belgilanmagan'}
              </span>
            </span>
            <span
              className="rounded-full px-3 py-1.5 text-sm font-extrabold"
              style={grade ? { backgroundColor: GRADE[grade].light, color: GRADE[grade].dark } : { backgroundColor: '#F3ECDF', color: '#5C6680' }}
            >
              {grade ? GRADE[grade].word : 'Baho yoʻq'}
            </span>
          </button>
        )
      })}
    </section>
  )
}
