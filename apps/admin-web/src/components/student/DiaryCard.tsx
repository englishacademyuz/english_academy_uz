import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  assessmentTypeLabel,
  attendanceStatusLabel,
  formatLongDate,
  formatMonthLong,
  formatWeekRange,
  paymentStatusLabel,
  paymentStatusTone,
  toDateInputValue,
} from '../../lib/format'
import { startOfMonth, startOfWeek } from '../../lib/dateRange'
import type { AttendanceStatus, Payment, StudentOverview } from '../../lib/types'
import { Badge, Card, EmptyState, Tabs } from '../ui'
import { PeriodNav } from './PeriodNav'

type View = 'week' | 'month' | 'all'

const VIEWS: Array<{ key: View; label: string }> = [
  { key: 'week', label: 'Haftalik' },
  { key: 'month', label: 'Oylik' },
  { key: 'all', label: 'Barchasi' },
]

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']
const STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']

const STATUS_CELL: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  LATE: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  ABSENT: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30',
  EXCUSED: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
}
const STATUS_DOT: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500',
  LATE: 'bg-amber-400',
  ABSENT: 'bg-red-500',
  EXCUSED: 'bg-sky-500',
}
const STATUS_TONE: Record<AttendanceStatus, 'green' | 'amber' | 'red' | 'brand'> = {
  PRESENT: 'green',
  LATE: 'amber',
  ABSENT: 'red',
  EXCUSED: 'brand',
}

type Mark = { id: string; title: string; detail: string; score: number; max: number; quiz: boolean }

/** One calendar day of the student's record: the lesson (and its attendance) if there was one, and every mark given that day. */
type Day = { key: string; date: Date; group: string | null; status: AttendanceStatus | null; marks: Mark[] }

const percentOf = (m: Mark) => (m.max ? (m.score / m.max) * 100 : 0)
const average = (marks: Mark[]) => (marks.length ? marks.reduce((sum, m) => sum + percentOf(m), 0) / marks.length : null)

function tone(percent: number) {
  if (percent >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' }
  if (percent >= 60) return { bar: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-400' }
  return { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400' }
}

const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`

/** Folds attendance, lesson days, assessments and quiz results into one record per calendar day. */
function useDays(overview: StudentOverview) {
  return useMemo(() => {
    const days = new Map<string, Day>()
    const dayOf = (value: string) => {
      const date = new Date(value)
      const key = toDateInputValue(date)
      let day = days.get(key)
      if (!day) {
        day = { key, date: new Date(date.getFullYear(), date.getMonth(), date.getDate()), group: null, status: null, marks: [] }
        days.set(key, day)
      }
      return day
    }

    for (const lesson of overview.lessonDays) dayOf(lesson.date).group = lesson.group.name
    for (const record of overview.attendance.records) {
      const day = dayOf(record.lessonSession.date)
      day.status = record.status
      day.group = record.lessonSession.group.name
    }
    for (const r of overview.assessmentResults) {
      dayOf(r.assessment.date).marks.push({
        id: r.id,
        title: r.assessment.title,
        detail: [
          r.assessment.category.name !== r.assessment.title ? r.assessment.category.name : null,
          assessmentTypeLabel[r.assessment.type],
          r.assessment.group.name,
        ]
          .filter(Boolean)
          .join(' · '),
        score: r.score,
        max: r.assessment.maxScore,
        quiz: false,
      })
    }
    for (const q of overview.quizResults) {
      dayOf(q.date).marks.push({
        id: q.id,
        title: q.quizTitle,
        detail: `Test · ${q.group.name} · +${q.points} ball`,
        score: q.correctCount,
        max: q.totalQuestions,
        quiz: true,
      })
    }
    return days
  }, [overview])
}

/** The month's payment, or "Kutilmoqda" for the current month while nothing is recorded yet. */
function PaymentBadge({ month, payments, now }: { month: Date; payments: Payment[]; now: Date }) {
  const payment = payments.find((p) => p.year === month.getFullYear() && p.month === month.getMonth() + 1)
  if (payment) {
    return <Badge tone={paymentStatusTone[payment.status]}>Toʻlov: {paymentStatusLabel[payment.status]}</Badge>
  }
  if (monthKey(month) === monthKey(now)) return <Badge tone="slate">Toʻlov: Kutilmoqda</Badge>
  return null
}

/**
 * Kundalik: attendance and marks together, the way the student sees them in the
 * Mini App -- a week's lesson days, a month as a clickable calendar, or every
 * month at a glance (click one to open its calendar).
 */
export function DiaryCard({ overview }: { overview: StudentOverview }) {
  const now = useMemo(() => new Date(), [])
  const days = useDays(overview)
  const [view, setView] = useState<View>('month')
  const [week, setWeek] = useState(() => startOfWeek(now))
  const [month, setMonth] = useState(() => startOfMonth(now))
  const rate = overview.attendance.rate

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Davomat va baholar</h2>
          {rate !== null && (
            <Badge tone={rate >= 80 ? 'green' : rate >= 50 ? 'amber' : 'red'}>Umumiy davomat: {rate.toFixed(0)}%</Badge>
          )}
        </div>
        <Tabs tabs={VIEWS} active={view} onChange={setView} size="xs" variant="segmented" />
      </div>

      {view === 'week' && <WeekView days={days} week={week} onWeek={setWeek} now={now} />}
      {view === 'month' && (
        <MonthView days={days} month={month} onMonth={setMonth} now={now} payments={overview.payments.list} />
      )}
      {view === 'all' && (
        <AllView
          days={days}
          now={now}
          payments={overview.payments.list}
          onPick={(m) => {
            setMonth(m)
            setView('month')
          }}
        />
      )}
    </Card>
  )
}

function WeekView({ days, week, onWeek, now }: { days: Map<string, Day>; week: Date; onWeek: (d: Date) => void; now: Date }) {
  const shift = (by: number) => new Date(week.getFullYear(), week.getMonth(), week.getDate() + by * 7)
  const isCurrent = toDateInputValue(week) === toDateInputValue(startOfWeek(now))
  const inWeek = Array.from({ length: 7 }, (_, i) =>
    days.get(toDateInputValue(new Date(week.getFullYear(), week.getMonth(), week.getDate() + i))),
  ).filter((d): d is Day => !!d)

  return (
    <div>
      <div className="mb-4">
        <PeriodNav
          label={formatWeekRange(week)}
          onPrev={() => onWeek(shift(-1))}
          onNext={() => onWeek(shift(1))}
          canGoNext={!isCurrent}
          onCurrent={isCurrent ? undefined : () => onWeek(startOfWeek(now))}
          currentLabel="Joriy hafta"
        />
      </div>
      {inWeek.length === 0 ? (
        <EmptyState title="Bu haftada dars yoki baho yoʻq" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {inWeek.map((day) => (
            <DayPanel key={day.key} day={day} />
          ))}
        </div>
      )}
    </div>
  )
}

function MonthView({
  days,
  month,
  onMonth,
  now,
  payments,
}: {
  days: Map<string, Day>
  month: Date
  onMonth: (d: Date) => void
  now: Date
  payments: Payment[]
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const isCurrent = monthKey(month) === monthKey(now)
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const lead = (month.getDay() + 6) % 7
  const inMonth = Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))
  const monthDays = inMonth.map((d) => days.get(toDateInputValue(d))).filter((d): d is Day => !!d)

  // Default to the latest day of the month that has something to show.
  const selectedKey = picked && monthDays.some((d) => d.key === picked) ? picked : (monthDays.at(-1)?.key ?? null)
  const selected = selectedKey ? days.get(selectedKey)! : null

  const totals = Object.fromEntries(STATUSES.map((s) => [s, monthDays.filter((d) => d.status === s).length])) as Record<
    AttendanceStatus,
    number
  >
  const monthAverage = average(monthDays.flatMap((d) => d.marks))
  const todayKey = toDateInputValue(now)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <PeriodNav
          label={formatMonthLong(month)}
          onPrev={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          onNext={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          canGoNext={!isCurrent}
          onCurrent={isCurrent ? undefined : () => onMonth(startOfMonth(now))}
          currentLabel="Joriy oy"
        />
        <div className="flex flex-wrap items-center gap-2">
          {monthAverage !== null && <Badge tone="brand">Oʻrtacha baho: {Math.round(monthAverage)}%</Badge>}
          <PaymentBadge month={month} payments={payments} now={now} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1 text-[11px] font-medium uppercase text-slate-400 dark:text-slate-500">
                {d}
              </div>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <div key={`lead-${i}`} />
            ))}
            {inMonth.map((date) => {
              const key = toDateInputValue(date)
              const day = days.get(key)
              const today = key === todayKey ? ' ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900' : ''
              if (!day) {
                return (
                  <div
                    key={key}
                    className={`flex h-14 items-center justify-center rounded-lg text-sm text-slate-300 dark:text-slate-600${today}`}
                  >
                    {date.getDate()}
                  </div>
                )
              }
              const avg = average(day.marks)
              const look = day.status
                ? STATUS_CELL[day.status]
                : day.group
                  ? 'border border-dashed border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                  : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPicked(key)}
                  title={formatLongDate(date)}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-sm font-semibold transition-shadow ${look}${today} ${
                    key === selectedKey ? 'outline outline-2 outline-offset-1 outline-slate-900 dark:outline-slate-100' : ''
                  }`}
                >
                  {date.getDate()}
                  {avg !== null && (
                    <span className={`text-[11px] font-bold leading-none tabular-nums ${tone(avg).text}`}>{Math.round(avg)}%</span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {STATUSES.map((status) => (
              <div key={status} className="rounded-lg bg-slate-50 px-2 py-2 text-center dark:bg-slate-800/60">
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{totals[status]}</p>
                <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                  {attendanceStatusLabel[status]}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <span className="inline-block h-3 w-3 rounded border border-dashed border-slate-300 dark:border-slate-600" />
            Dars boʻlgan, davomat belgilanmagan · kun ostidagi % — oʻsha kundagi oʻrtacha baho
          </p>
        </div>

        {selected ? <DayPanel day={selected} /> : <EmptyState title="Bu oyda dars yoki baho yoʻq" />}
      </div>
    </div>
  )
}

/** One day: its date, group and attendance, then every mark given that day. */
function DayPanel({ day }: { day: Day }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatLongDate(day.date)}</p>
          {day.group && <p className="text-xs text-slate-500 dark:text-slate-400">{day.group}</p>}
        </div>
        {day.status ? (
          <Badge tone={STATUS_TONE[day.status]}>{attendanceStatusLabel[day.status]}</Badge>
        ) : day.group ? (
          <Badge tone="slate">Davomat belgilanmagan</Badge>
        ) : null}
      </div>
      {day.marks.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Bu kuni baho qoʻyilmagan</p>
      ) : (
        <ul className="space-y-2">
          {day.marks.map((mark) => {
            const percent = Math.round(percentOf(mark))
            const t = tone(percent)
            return (
              <li key={mark.id} className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {mark.quiz && '🧠 '}
                      {mark.title}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{mark.detail}</p>
                  </div>
                  <p className={`shrink-0 text-lg font-bold tabular-nums ${t.text}`}>
                    {mark.score}
                    <span className="text-sm font-medium text-slate-400 dark:text-slate-500">/{mark.max}</span>
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${percent}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Every month with a record, newest first -- clicking one opens its calendar. */
function AllView({
  days,
  now,
  payments,
  onPick,
}: {
  days: Map<string, Day>
  now: Date
  payments: Payment[]
  onPick: (month: Date) => void
}) {
  const months = useMemo(() => {
    const byMonth = new Map<string, { month: Date; days: Day[] }>()
    for (const day of days.values()) {
      const key = monthKey(day.date)
      const entry = byMonth.get(key) ?? { month: startOfMonth(day.date), days: [] }
      entry.days.push(day)
      byMonth.set(key, entry)
    }
    // A paid (or owed) month shows up even without a lesson in it.
    for (const p of payments) {
      const month = new Date(p.year, p.month - 1, 1)
      if (!byMonth.has(monthKey(month))) byMonth.set(monthKey(month), { month, days: [] })
    }
    return [...byMonth.values()].sort((a, b) => b.month.getTime() - a.month.getTime())
  }, [days, payments])

  if (months.length === 0) return <EmptyState title="Hali davomat, baho yoki toʻlov yoʻq" />

  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {months.map(({ month, days: monthDays }) => {
        const counted = monthDays.filter((d) => d.status && d.status !== 'EXCUSED')
        const attended = counted.filter((d) => d.status === 'PRESENT' || d.status === 'LATE').length
        const marks = monthDays.flatMap((d) => d.marks)
        const avg = average(marks)
        return (
          <li key={monthKey(month)}>
            <button
              type="button"
              onClick={() => onPick(month)}
              className="flex w-full items-center gap-4 rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-slate-700 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/5"
            >
              <div className="min-w-0 grow">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatMonthLong(month)}</p>
                  <PaymentBadge month={month} payments={payments} now={now} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {counted.length ? `${counted.length} darsdan ${attended} tasiga keldi` : 'Davomat belgilanmagan'}
                  {' · '}
                  {marks.length ? `${marks.length} ta baho` : 'baho yoʻq'}
                </p>
                {counted.length > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className={`h-full rounded-full ${tone((attended / counted.length) * 100).bar}`}
                      style={{ width: `${(attended / counted.length) * 100}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-xl font-bold tabular-nums ${avg !== null ? tone(avg).text : 'text-slate-300 dark:text-slate-600'}`}>
                  {avg !== null ? `${Math.round(avg)}%` : '—'}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">oʻrtacha baho</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
