import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, MinusCircle, XCircle } from 'lucide-react'
import { sessions as sessionsApi } from '../../lib/api'
import { attendanceStatusLabel, toDateInputValue } from '../../lib/format'
import { isFutureDay, isSameDay } from '../../lib/dateRange'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { AttendanceStatus, Group } from '../../lib/types'
import { Button, ColumnLabel } from '../ui'
import { DetailMatrix, type MatrixColumn } from './DetailMatrix'
import { DayNavHeader } from './DayNavHeader'
import { useLessonDayNav } from './useLessonDayNav'

const STATUS_ICONS: Record<AttendanceStatus, typeof CheckCircle2> = {
  PRESENT: CheckCircle2,
  LATE: Clock,
  ABSENT: XCircle,
  EXCUSED: MinusCircle,
}
const STATUS_ORDER: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']

// Distinct fill per status when selected -- shared by today's editable buttons
// and past days' read-only cells so both look identical at a glance.
const STATUS_SELECTED_CLASS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500 text-white shadow-sm',
  LATE: 'bg-amber-500 text-white shadow-sm',
  ABSENT: 'bg-red-500 text-white shadow-sm',
  EXCUSED: 'bg-violet-500 text-white shadow-sm',
}

/** Attendance tab: date/day header with prev/next navigation over recorded lesson days, then 4 status columns. */
export function JournalView({ group, initialDate }: { group: Group; initialDate?: Date }) {
  const nav = useLessonDayNav(group.id, initialDate)
  const { selectedDate, isSelectedToday } = nav
  // Corrections are allowed on any day that's already happened (§51.5: edits
  // overwrite in place, no audit trail) -- only a lesson that hasn't
  // happened yet is locked, since there's nothing to record.
  const isEditable = !isFutureDay(selectedDate, nav.now)
  const queryClient = useQueryClient()
  const roster = group.enrollments ?? []

  const selectedSession = nav.sessions.find((s) => isSameDay(new Date(s.date), selectedDate))

  const [pending, setPending] = useState<Record<string, AttendanceStatus>>({})
  useEffect(() => {
    const map: Record<string, AttendanceStatus> = {}
    for (const a of selectedSession?.attendances ?? []) map[a.studentId] = a.status
    setPending(map)
  }, [selectedDate.getTime(), selectedSession?.id])

  const saveMutation = useMutation({
    mutationFn: () =>
      sessionsApi.record(group.id, {
        date: toDateInputValue(selectedDate),
        attendance: Object.entries(pending).map(([studentId, status]) => ({ studentId, status })),
      }),
    onSuccess: () => {
      notifySuccess('Davomat saqlandi')
      queryClient.invalidateQueries({ queryKey: ['group-sessions', group.id] })
    },
    onError: (err) => notifyError(err, 'Davomatni saqlab boʻlmadi'),
  })

  const columns: MatrixColumn[] = STATUS_ORDER.map((status) => ({
    key: status,
    header: <ColumnLabel>{attendanceStatusLabel[status]}</ColumnLabel>,
    width: 120,
    render: (studentId) => {
      const Icon = STATUS_ICONS[status]
      const recordedStatus = selectedSession?.attendances.find((a) => a.studentId === studentId)?.status
      const selected = isEditable ? pending[studentId] === status : recordedStatus === status
      const fillClass = selected
        ? STATUS_SELECTED_CLASS[status]
        : 'bg-slate-100 text-slate-300 dark:bg-slate-800/60 dark:text-slate-600'

      if (!isEditable) {
        // Same square look as an editable day's controls, but a plain span --
        // a future lesson that hasn't happened yet has nothing to edit.
        return (
          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${fillClass}`}>
            <Icon className="h-4 w-4" />
          </span>
        )
      }

      return (
        <button
          type="button"
          title={attendanceStatusLabel[status]}
          onClick={() => setPending((prev) => ({ ...prev, [studentId]: status }))}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${fillClass} ${
            selected
              ? ''
              : 'hover:bg-slate-200 hover:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-400'
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      )
    },
  }))

  return (
    <div className="flex flex-1 flex-col">
      <DetailMatrix
        roster={roster}
        columns={columns}
        groupHeader={
          <DayNavHeader
            selectedDate={nav.selectedDate}
            isSelectedToday={nav.isSelectedToday}
            canGoNext={nav.canGoNext}
            isFetching={nav.isFetching}
            onPrev={nav.goPrev}
            onNext={nav.goNext}
            onToday={nav.goToday}
          />
        }
      />

      {isEditable && roster.length > 0 && (
        <div className="flex justify-end px-5 py-2.5">
          <Button size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            {isSelectedToday ? 'Davomatni saqlash' : 'Tuzatishni saqlash'}
          </Button>
        </div>
      )}
    </div>
  )
}
