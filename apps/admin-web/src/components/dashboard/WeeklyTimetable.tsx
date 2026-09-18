import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Clock, Users } from 'lucide-react'
import { dayLabel, formatDayMonth } from '../../lib/format'
import { isSameDay } from '../../lib/dateRange'
import type { Group } from '../../lib/types'
import { Button, Card } from '../ui'

const WEEK_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const daysSinceMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - daysSinceMonday)
  return d
}

export function WeeklyTimetable({ groups }: { groups: Group[] }) {
  const navigate = useNavigate()
  const [weekOffset, setWeekOffset] = useState(0)
  const today = new Date()

  const monday = startOfWeek(today)
  monday.setDate(monday.getDate() + weekOffset * 7)

  const days = WEEK_ORDER.map((code, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const lessons = [...groups]
      .filter((g) => g.scheduleDays.includes(code))
      .sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime))
    return { code, date, lessons }
  })

  const rangeLabel = `${formatDayMonth(days[0].date)} – ${formatDayMonth(days[6].date)}, ${days[0].date.getFullYear()}`

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Haftalik dars jadvali</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Oldingi hafta">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[150px] text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            {rangeLabel}
          </span>
          <Button variant="secondary" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Keyingi hafta">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" onClick={() => setWeekOffset(0)}>
              Bugun
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 overflow-x-auto">
        {days.map((day) => {
          const highlighted = isSameDay(day.date, today)
          return (
            <div
              key={day.code}
              className={`min-w-[130px] rounded-lg p-2 ${
                highlighted
                  ? 'bg-brand-50 ring-1 ring-inset ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/30'
                  : 'bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <p
                className={`mb-2 text-center text-xs font-semibold ${
                  highlighted ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {dayLabel[day.code]} · {formatDayMonth(day.date)}
              </p>

              <div className="space-y-1.5">
                {day.lessons.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-300 dark:text-slate-600">—</p>
                ) : (
                  day.lessons.map((group) => (
                    <div
                      key={group.id}
                      onDoubleClick={() => navigate(`/groups/${group.id}`)}
                      title="Guruh sahifasiga oʻtish uchun ikki marta bosing"
                      className="cursor-pointer rounded-md bg-white p-2 text-xs shadow-sm ring-1 ring-inset ring-slate-200 transition-colors hover:ring-brand-300 dark:bg-slate-900 dark:ring-slate-700 dark:hover:ring-brand-500/50"
                    >
                      <p className="flex items-center gap-1 font-semibold text-slate-900 dark:text-slate-100">
                        <Clock className="h-3 w-3 text-brand-600 dark:text-brand-400" /> {group.scheduleTime}
                      </p>
                      <p className="mt-0.5 truncate font-medium text-slate-700 dark:text-slate-300">{group.name}</p>
                      <p className="truncate text-slate-500 dark:text-slate-400">{group.teacher?.fullName}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-slate-400 dark:text-slate-500">
                        <Users className="h-3 w-3" /> {group.enrollments?.length ?? 0}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
