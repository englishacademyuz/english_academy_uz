import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AttendanceStatus } from '../../lib/types'
import { miniApi } from '../api'
import { Card, Empty, ErrorState, Loading, Pill, Screen } from '../components/kit'
import { ATTENDANCE, formatDate, formatMonthLong, percent, rateTone } from '../format'

const ORDER: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']

/** Davomat: one month at a time -- each lesson with a clear ✅/❌ status, plus the month's totals. */
export function AttendancePage() {
  const now = useMemo(() => new Date(), [])
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const isCurrent = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth()
  const year = month.getFullYear()
  const m = month.getMonth() + 1

  const attendance = useQuery({ queryKey: ['mini', 'attendance', year, m], queryFn: () => miniApi.attendance(year, m) })
  const data = attendance.data

  return (
    <Screen title="Davomat">
      <div className="flex items-center justify-between rounded-2xl bg-white p-2 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
        <button
          onClick={() => setMonth(new Date(year, m - 2, 1))}
          className="rounded-xl p-2 text-slate-500 active:bg-slate-100 dark:active:bg-slate-800"
          aria-label="Oldingi oy"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-slate-900 dark:text-white">{formatMonthLong(month)}</span>
        <button
          onClick={() => setMonth(new Date(year, m, 1))}
          disabled={isCurrent}
          className="rounded-xl p-2 text-slate-500 active:bg-slate-100 disabled:opacity-30 dark:active:bg-slate-800"
          aria-label="Keyingi oy"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {attendance.isLoading ? (
        <Loading />
      ) : attendance.error || !data ? (
        <ErrorState error={attendance.error} onRetry={() => attendance.refetch()} />
      ) : (
        <>
          <Card className="text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">Umumiy davomat</p>
            {data.rate === null ? (
              <p className="mt-1 text-base font-medium text-slate-500 dark:text-slate-400">Maʼlumot mavjud emas</p>
            ) : (
              <p
                className={`mt-1 text-5xl font-extrabold tabular-nums ${
                  { green: 'text-emerald-600', amber: 'text-amber-500', red: 'text-red-600', slate: 'text-slate-500' }[
                    rateTone(data.rate) as 'green' | 'amber' | 'red' | 'slate'
                  ]
                }`}
              >
                {percent(data.rate)}
              </p>
            )}
            <div className="mt-4 grid grid-cols-4 gap-1.5">
              {ORDER.map((s) => (
                <div key={s} className="rounded-xl bg-slate-50 py-2 dark:bg-slate-800/60">
                  <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{data.totals[s]}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {ATTENDANCE[s].icon} {ATTENDANCE[s].label}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          {data.days.length === 0 ? (
            <Empty icon="📅" title="Bu oyda dars boʻlmagan" />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.days.map((day) => {
                  const status = day.status ? ATTENDANCE[day.status] : null
                  return (
                    <li key={day.lessonId} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{formatDate(day.date)}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{day.topic || day.group}</p>
                      </div>
                      {status ? (
                        <Pill tone={status.tone}>
                          {status.icon} {status.label}
                        </Pill>
                      ) : (
                        <Pill>Belgilanmagan</Pill>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </>
      )}
    </Screen>
  )
}
