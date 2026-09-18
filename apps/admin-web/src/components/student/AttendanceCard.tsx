import { attendanceStatusLabel, attendanceStatusTone, formatDate } from '../../lib/format'
import type { AttendanceStatus, StudentOverviewAttendanceEntry } from '../../lib/types'
import { Badge, Card, EmptyState } from '../ui'

const STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']

export function AttendanceCard({
  totals,
  rate,
  recent,
}: {
  totals: Record<AttendanceStatus, number>
  rate: number | null
  recent: StudentOverviewAttendanceEntry[]
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Davomat</h2>
        {rate !== null && <Badge tone={rate >= 80 ? 'green' : rate >= 50 ? 'amber' : 'red'}>{rate.toFixed(0)}%</Badge>}
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        {STATUSES.map((status) => (
          <div key={status} className="rounded-lg bg-slate-50 p-2 text-center dark:bg-slate-800/60">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{totals[status]}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{attendanceStatusLabel[status]}</p>
          </div>
        ))}
      </div>

      {recent.length === 0 ? (
        <EmptyState title="Hali davomat qayd etilmagan" />
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {recent.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between py-2">
              <div className="text-sm text-slate-700 dark:text-slate-300">
                {formatDate(entry.lessonSession.date)}{' '}
                <span className="text-xs text-slate-400 dark:text-slate-500">{entry.lessonSession.group.name}</span>
              </div>
              <Badge tone={attendanceStatusTone[entry.status]}>{attendanceStatusLabel[entry.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
