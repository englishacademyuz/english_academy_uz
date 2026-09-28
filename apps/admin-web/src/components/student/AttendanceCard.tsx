import { useMemo, useState } from 'react'
import { attendanceStatusLabel, formatDate, formatMonthLong } from '../../lib/format'
import type { AttendanceStatus, StudentOverview } from '../../lib/types'
import { Badge, Card } from '../ui'
import { PeriodNav } from './PeriodNav'

const STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']
const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']

const STATUS_CELL: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500 text-white dark:bg-emerald-600',
  LATE: 'bg-amber-400 text-white dark:bg-amber-500',
  ABSENT: 'bg-red-500 text-white dark:bg-red-600',
  EXCUSED: 'bg-sky-500 text-white dark:bg-sky-600',
}
const STATUS_DOT: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500',
  LATE: 'bg-amber-400',
  ABSENT: 'bg-red-500',
  EXCUSED: 'bg-sky-500',
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/**
 * One month as a calendar: each lesson day is painted by the student's attendance
 * (green present, amber late, red absent, blue excused), a lesson with nothing
 * marked gets a dashed outline, and non-lesson days stay blank.
 */
export function AttendanceCard({
  attendance,
  lessonDays,
}: {
  attendance: StudentOverview['attendance']
  lessonDays: StudentOverview['lessonDays']
}) {
  const now = useMemo(() => new Date(), [])
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const isCurrentMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth()

  const { statusByDay, lessonsByDay } = useMemo(() => {
    const statusByDay = new Map<string, { status: AttendanceStatus; group: string }>()
    for (const r of attendance.records) {
      statusByDay.set(dayKey(new Date(r.lessonSession.date)), { status: r.status, group: r.lessonSession.group.name })
    }
    const lessonsByDay = new Map<string, string>()
    for (const l of lessonDays) lessonsByDay.set(dayKey(new Date(l.date)), l.group.name)
    return { statusByDay, lessonsByDay }
  }, [attendance.records, lessonDays])

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const leading = (first.getDay() + 6) % 7 // Monday-first
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
    ]
  }, [month])

  const monthTotals = useMemo(() => {
    const totals: Record<AttendanceStatus, number> = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 }
    for (const date of cells) {
      const entry = date && statusByDay.get(dayKey(date))
      if (entry) totals[entry.status] += 1
    }
    return totals
  }, [cells, statusByDay])

  const rate = attendance.rate

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Davomat</h2>
          {rate !== null && (
            <Badge tone={rate >= 80 ? 'green' : rate >= 50 ? 'amber' : 'red'}>Umumiy: {rate.toFixed(0)}%</Badge>
          )}
        </div>
        <PeriodNav
          label={formatMonthLong(month)}
          onPrev={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          onNext={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          canGoNext={!isCurrentMonth}
          onCurrent={isCurrentMonth ? undefined : () => setMonth(new Date(now.getFullYear(), now.getMonth(), 1))}
          currentLabel="Joriy oy"
        />
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-[11px] font-medium uppercase text-slate-400 dark:text-slate-500">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />
          const key = dayKey(date)
          const entry = statusByDay.get(key)
          const lessonGroup = lessonsByDay.get(key)
          const isToday = key === dayKey(now)
          const base = 'flex aspect-square items-center justify-center rounded-lg text-sm font-medium'
          const today = isToday ? ' ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900' : ''

          if (entry) {
            return (
              <div
                key={key}
                title={`${formatDate(date)} · ${entry.group} · ${attendanceStatusLabel[entry.status]}`}
                className={`${base} ${STATUS_CELL[entry.status]}${today}`}
              >
                {date.getDate()}
              </div>
            )
          }
          if (lessonGroup) {
            return (
              <div
                key={key}
                title={`${formatDate(date)} · ${lessonGroup} · belgilanmagan`}
                className={`${base} border border-dashed border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400${today}`}
              >
                {date.getDate()}
              </div>
            )
          }
          return (
            <div key={key} className={`${base} text-slate-300 dark:text-slate-600${today}`}>
              {date.getDate()}
            </div>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {STATUSES.map((status) => (
          <div key={status} className="rounded-lg bg-slate-50 px-2 py-2 text-center dark:bg-slate-800/60">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{monthTotals[status]}</p>
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
              {attendanceStatusLabel[status]}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <span className="inline-block h-3 w-3 rounded border border-dashed border-slate-300 dark:border-slate-600" />
        Dars boʻlgan, davomat belgilanmagan
      </p>
    </Card>
  )
}
